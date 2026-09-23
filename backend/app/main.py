from __future__ import annotations

import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("HR_DB_PATH", BASE_DIR / "data" / "hr_attrition.db"))
SAMPLE_CSV = BASE_DIR.parent / "project_submission" / "data" / "IBM HR Employee Attrition Data.csv"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

REQUIRED = {
    "Attrition", "Department", "JobRole", "OverTime", "JobSatisfaction",
    "EnvironmentSatisfaction", "WorkLifeBalance", "YearsAtCompany",
    "JobLevel", "StockOptionLevel", "NumCompaniesWorked", "DistanceFromHome",
}
OPTIONAL_DEFAULTS = {
    "EmployeeNumber": None, "Age": 0, "MonthlyIncome": 0, "TotalWorkingYears": 0,
}

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if not get_rows() and SAMPLE_CSV.exists():
        save_dataset(normalize_csv(SAMPLE_CSV.read_bytes(), SAMPLE_CSV.name), SAMPLE_CSV.name, "sample")
    yield


app = FastAPI(title="HR Attrition Analytics API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS datasets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'upload'
        );
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY,
            payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)


def clean_number(v: Any) -> float:
    try:
        if pd.isna(v): return 0.0
        return float(str(v).replace(",", "").strip())
    except Exception:
        return 0.0


def clean_text(v: Any, default: str = "Unknown") -> str:
    if pd.isna(v) or str(v).strip() == "": return default
    return str(v).strip()


def score_row(raw: dict[str, Any], index: int) -> dict[str, Any]:
    overtime = clean_text(raw.get("OverTime"), "No").lower() == "yes"
    job_sat = clean_number(raw.get("JobSatisfaction"))
    env_sat = clean_number(raw.get("EnvironmentSatisfaction"))
    wlb = clean_number(raw.get("WorkLifeBalance"))
    years = clean_number(raw.get("YearsAtCompany"))
    mobility = clean_number(raw.get("NumCompaniesWorked"))
    commute = clean_number(raw.get("DistanceFromHome"))
    level = clean_number(raw.get("JobLevel"))
    stock = clean_number(raw.get("StockOptionLevel"))
    satisfaction = max(0, (4 - job_sat) * 5 + (4 - env_sat) * 4 + (4 - wlb) * 4)
    overtime_pts = 19 if overtime else 0
    tenure = 17 if years <= 2 else 8 if years <= 5 else 0
    mobility_pts = 9 if mobility >= 4 else 0
    commute_pts = 8 if commute >= 15 else 0
    level_pts = 8 if level == 1 else 0
    stock_pts = 6 if stock == 0 else 0
    score = min(99, round(12 + overtime_pts + satisfaction + tenure + mobility_pts + commute_pts + level_pts + stock_pts))
    signals: list[str] = []
    if overtime_pts: signals.append("Frequent overtime")
    if satisfaction >= 14: signals.append("Low satisfaction signals")
    if tenure: signals.append("Early tenure")
    if mobility_pts: signals.append("Multiple prior employers")
    if commute_pts: signals.append("Long commute")
    if stock_pts: signals.append("No stock options")
    return {
        "id": int(clean_number(raw.get("EmployeeNumber")) or index + 1),
        "age": int(clean_number(raw.get("Age"))),
        "attrition": "Yes" if clean_text(raw.get("Attrition"), "No").lower() == "yes" else "No",
        "department": clean_text(raw.get("Department")),
        "jobRole": clean_text(raw.get("JobRole")),
        "monthlyIncome": clean_number(raw.get("MonthlyIncome")),
        "overtime": "Yes" if overtime else "No",
        "yearsAtCompany": int(years),
        "jobSatisfaction": int(job_sat),
        "environmentSatisfaction": int(env_sat),
        "workLifeBalance": int(wlb),
        "jobLevel": int(level),
        "stockOptionLevel": int(stock),
        "numCompaniesWorked": int(mobility),
        "distanceFromHome": int(commute),
        "totalWorkingYears": int(clean_number(raw.get("TotalWorkingYears"))),
        "riskScore": int(score),
        "riskTier": "Priority" if score >= 62 else "Elevated" if score >= 40 else "Monitor",
        "signals": signals[:3] or ["Stable profile"],
    }


def normalize_csv(content: bytes, filename: str) -> list[dict[str, Any]]:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"CSV is too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Unable to read CSV: {e}") from e
    df.columns = [str(c).strip() for c in df.columns]
    aliases = {
        "employee number": "EmployeeNumber", "employee_number": "EmployeeNumber", "employee id": "EmployeeNumber",
        "job role": "JobRole", "job_role": "JobRole", "department name": "Department",
        "overtime": "OverTime", "over time": "OverTime", "attrition flag": "Attrition",
        "job satisfaction": "JobSatisfaction", "environment satisfaction": "EnvironmentSatisfaction",
        "work life balance": "WorkLifeBalance", "years at company": "YearsAtCompany",
        "job level": "JobLevel", "stock option level": "StockOptionLevel",
        "number of companies worked": "NumCompaniesWorked", "num companies worked": "NumCompaniesWorked",
        "distance from home": "DistanceFromHome", "monthly income": "MonthlyIncome",
        "total working years": "TotalWorkingYears",
    }
    renamed = {}
    for column in df.columns:
        key = column.lower().replace("-", " ").strip()
        renamed[column] = aliases.get(key, column)
    df = df.rename(columns=renamed)
    missing = sorted(REQUIRED - set(df.columns))
    if missing:
        raise HTTPException(400, "CSV is missing required columns: " + ", ".join(missing))
    if df.empty:
        raise HTTPException(400, "CSV contains no employee rows.")
    rows = [score_row(row, i) for i, row in enumerate(df.to_dict(orient="records"))]
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        for i, row in enumerate(rows): row["id"] = i + 1
    return rows


def save_dataset(rows: list[dict[str, Any]], filename: str, source: str = "upload") -> dict[str, Any]:
    uploaded_at = datetime.now(timezone.utc).isoformat()
    with conn() as c:
        c.execute("DELETE FROM employees")
        c.executemany("INSERT INTO employees(id, payload) VALUES (?, ?)", [(r["id"], json.dumps(r)) for r in rows])
        cur = c.execute("INSERT INTO datasets(filename,row_count,uploaded_at,source) VALUES (?,?,?,?)", (filename, len(rows), uploaded_at, source))
        dataset_id = cur.lastrowid
        c.execute("INSERT OR REPLACE INTO app_meta(key,value) VALUES('current_dataset_id',?)", (str(dataset_id),))
    return {"id": dataset_id, "filename": filename, "rowCount": len(rows), "uploadedAt": uploaded_at, "source": source}


def get_rows() -> list[dict[str, Any]]:
    with conn() as c:
        return [json.loads(r["payload"]) for r in c.execute("SELECT payload FROM employees ORDER BY id")]


def get_current_meta() -> dict[str, Any] | None:
    with conn() as c:
        row = c.execute("SELECT d.* FROM datasets d JOIN app_meta m ON d.id=CAST(m.value AS INTEGER) WHERE m.key='current_dataset_id'").fetchone()
    if not row: return None
    return {"id": row["id"], "filename": row["filename"], "rowCount": row["row_count"], "uploadedAt": row["uploaded_at"], "source": row["source"]}


def group(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for r in rows: counts[str(r.get(key, "Unknown"))] = counts.get(str(r.get(key, "Unknown")), 0) + 1
    return [{"name": k, "value": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]


def analysis(rows: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(rows)
    attr = sum(r["attrition"] == "Yes" for r in rows)
    overtime = sum(r["overtime"] == "Yes" for r in rows)
    priority = sum(r["riskTier"] == "Priority" for r in rows)
    avg = sum(r["riskScore"] for r in rows) / n if n else 0
    sat = lambda k: sum(r[k] for r in rows) / n if n else 0
    return {
        "population": n,
        "attritionRate": round(attr / n * 100, 2) if n else 0,
        "prioritySignals": priority,
        "overtimeRate": round(overtime / n * 100, 2) if n else 0,
        "averageRisk": round(avg, 2),
        "departments": group(rows, "department"),
        "roles": group(rows, "jobRole"),
        "riskTiers": group(rows, "riskTier"),
        "satisfaction": [
            {"name": "Job satisfaction", "score": round(sat("jobSatisfaction"), 2)},
            {"name": "Environment", "score": round(sat("environmentSatisfaction"), 2)},
            {"name": "Work-life balance", "score": round(sat("workLifeBalance"), 2)},
        ],
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dataset")
def dataset() -> dict[str, Any]:
    meta = get_current_meta()
    if not meta: raise HTTPException(404, "No dataset loaded.")
    return meta


@app.get("/api/employees")
def employees() -> list[dict[str, Any]]:
    return get_rows()


@app.get("/api/analysis")
def get_analysis() -> dict[str, Any]:
    return analysis(get_rows())


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a CSV file.")
    content = await file.read()
    rows = normalize_csv(content, file.filename)
    meta = save_dataset(rows, file.filename, "upload")
    return {"dataset": meta, "analysis": analysis(rows)}


@app.post("/api/dataset/reset")
def reset_dataset() -> dict[str, Any]:
    if not SAMPLE_CSV.exists(): raise HTTPException(404, "Bundled sample dataset not found.")
    rows = normalize_csv(SAMPLE_CSV.read_bytes(), SAMPLE_CSV.name)
    meta = save_dataset(rows, SAMPLE_CSV.name, "sample")
    return {"dataset": meta, "analysis": analysis(rows)}


@app.get("/api/export")
def export_csv() -> StreamingResponse:
    rows = get_rows()
    if not rows: raise HTTPException(404, "No dataset loaded.")
    df = pd.DataFrame(rows)
    data = df.to_csv(index=False).encode("utf-8")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=hr_attrition_analysis.csv"})

init_db()
