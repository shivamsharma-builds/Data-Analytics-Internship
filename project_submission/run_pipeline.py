"""End-to-end IBM HR attrition analysis pipeline.

Run from this directory:
    python run_pipeline.py

The script intentionally keeps the target definition explicit: Attrition is
the observed historical label in the IBM HR dataset. Risk probabilities are
analytical prioritization aids and should not be treated as employment
decisions.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "IBM HR Employee Attrition Data.csv"
OUTPUT_DIR = ROOT / "outputs"
FIGURES_DIR = OUTPUT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)
FIGURES_DIR.mkdir(exist_ok=True)

RANDOM_STATE = 42


def clean_data(path: Path) -> pd.DataFrame:
    """Load and standardize the Kaggle export without changing row meaning."""
    df = pd.read_csv(path)
    df.columns = [str(column).lstrip("\ufeff").strip() for column in df.columns]
    df = df.drop_duplicates().copy()

    categorical_columns = df.select_dtypes(include=["object"]).columns
    for column in categorical_columns:
        df[column] = df[column].astype("string").str.strip()
        df[column] = df[column].replace({"": pd.NA}).fillna("Unknown")

    numeric_columns = df.select_dtypes(exclude=["object", "string"]).columns
    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")
        if df[column].isna().any():
            df[column] = df[column].fillna(df[column].median())

    df["AttritionFlag"] = (df["Attrition"] == "Yes").astype(int)
    return df


def save_eda_figures(df: pd.DataFrame) -> None:
    """Write the five guide-aligned visualizations used in the report."""
    sns.set_theme(style="whitegrid", palette="deep")

    plt.figure(figsize=(8, 5))
    monthly = df.assign(SnapshotPeriod=(df["YearsAtCompany"] // 2).astype(int)).groupby("SnapshotPeriod", as_index=False)["AttritionFlag"].mean()
    monthly["AttritionRate"] = monthly["AttritionFlag"] * 100
    sns.lineplot(data=monthly, x="SnapshotPeriod", y="AttritionRate", marker="o", color="#0079F2")
    plt.title("Attrition rate by tenure band")
    plt.xlabel("Years at company, two-year bands")
    plt.ylabel("Attrition rate (%)")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "01_attrition_by_tenure.png", dpi=160)
    plt.close()

    plt.figure(figsize=(8, 5))
    department = df.groupby("Department", as_index=False)["AttritionFlag"].mean()
    department["AttritionRate"] = department["AttritionFlag"] * 100
    department = department.sort_values("AttritionRate", ascending=True)
    sns.barplot(data=department, x="AttritionRate", y="Department", color="#795EFF")
    plt.title("Attrition rate by department")
    plt.xlabel("Attrition rate (%)")
    plt.ylabel("")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "02_attrition_by_department.png", dpi=160)
    plt.close()

    plt.figure(figsize=(8, 5))
    overtime = df.groupby("OverTime", as_index=False)["AttritionFlag"].mean()
    overtime["AttritionRate"] = overtime["AttritionFlag"] * 100
    sns.barplot(data=overtime, x="OverTime", y="AttritionRate", color="#A60808")
    plt.title("Attrition rate by overtime status")
    plt.xlabel("Overtime")
    plt.ylabel("Attrition rate (%)")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "03_attrition_by_overtime.png", dpi=160)
    plt.close()

    plt.figure(figsize=(8, 5))
    role = df.groupby("JobRole", as_index=False).agg(
        Employees=("EmployeeNumber", "count"),
        AttritionRate=("AttritionFlag", "mean"),
    )
    role["AttritionRate"] = role["AttritionRate"] * 100
    role = role.sort_values("AttritionRate", ascending=True)
    sns.barplot(data=role, x="AttritionRate", y="JobRole", color="#009118")
    plt.title("Attrition rate by job role")
    plt.xlabel("Attrition rate (%)")
    plt.ylabel("")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "04_attrition_by_role.png", dpi=160)
    plt.close()

    plt.figure(figsize=(7, 5))
    sns.countplot(data=df, x="Attrition", hue="OverTime", palette=["#0079F2", "#A60808"])
    plt.title("Observed attrition split by overtime")
    plt.xlabel("Attrition")
    plt.ylabel("Employees")
    plt.legend(title="Overtime")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "05_attrition_split_overtime.png", dpi=160)
    plt.close()


def train_model(df: pd.DataFrame) -> tuple[Pipeline, dict, pd.DataFrame]:
    """Train an explainable baseline and score every employee."""
    features = [
        "Age",
        "MonthlyIncome",
        "JobLevel",
        "StockOptionLevel",
        "TotalWorkingYears",
        "YearsAtCompany",
        "YearsInCurrentRole",
        "YearsSinceLastPromotion",
        "YearsWithCurrManager",
        "JobSatisfaction",
        "EnvironmentSatisfaction",
        "WorkLifeBalance",
        "JobInvolvement",
        "DistanceFromHome",
        "NumCompaniesWorked",
        "OverTime",
        "BusinessTravel",
        "MaritalStatus",
        "JobRole",
        "Department",
    ]
    categorical = ["OverTime", "BusinessTravel", "MaritalStatus", "JobRole", "Department"]
    numeric = [feature for feature in features if feature not in categorical]

    X = df[features]
    y = df["AttritionFlag"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )

    preprocessor = ColumnTransformer(
        [
            ("numeric", StandardScaler(), numeric),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
        ]
    )
    model = Pipeline(
        [
            ("preprocessor", preprocessor),
            (
                "classifier",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )
    model.fit(X_train, y_train)

    test_probability = model.predict_proba(X_test)[:, 1]
    test_prediction = (test_probability >= 0.5).astype(int)
    matrix = confusion_matrix(y_test, test_prediction).tolist()
    metrics = {
        "records": int(len(df)),
        "attrition_count": int(y.sum()),
        "attrition_rate": round(float(y.mean() * 100), 2),
        "train_records": int(len(X_train)),
        "test_records": int(len(X_test)),
        "accuracy": round(float(accuracy_score(y_test, test_prediction)), 4),
        "precision": round(float(precision_score(y_test, test_prediction, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, test_prediction, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, test_probability)), 4),
        "confusion_matrix": matrix,
        "classification_report": classification_report(
            y_test, test_prediction, output_dict=True, zero_division=0
        ),
        "features": features,
        "target_definition": "Attrition == 'Yes'",
        "note": "This is a historical classification baseline and a prioritization aid, not a causal or employment decision model.",
    }
    (OUTPUT_DIR / "model_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    scored = df[["EmployeeNumber", "Age", "Department", "JobRole", "Attrition", "OverTime", "MonthlyIncome", "YearsAtCompany"]].copy()
    scored["churn_probability"] = model.predict_proba(df[features])[:, 1]
    scored["risk_tier"] = pd.cut(
        scored["churn_probability"],
        bins=[-float("inf"), 0.4, 0.7, float("inf")],
        labels=["Low", "Medium", "High"],
    )
    scored = scored.sort_values("churn_probability", ascending=False)
    scored.to_csv(OUTPUT_DIR / "employee_risk_scores.csv", index=False)
    return model, metrics, scored


def write_summary(df: pd.DataFrame, metrics: dict, scored: pd.DataFrame) -> None:
    """Write machine-readable summary values used by the DOCX and README."""
    summary = {
        "records": len(df),
        "features": len(df.columns) - 1,
        "attrition_rate": round(float(df["AttritionFlag"].mean() * 100), 2),
        "overtime_attrition_rate": round(float(df.loc[df["OverTime"] == "Yes", "AttritionFlag"].mean() * 100), 2),
        "non_overtime_attrition_rate": round(float(df.loc[df["OverTime"] == "No", "AttritionFlag"].mean() * 100), 2),
        "top_department": (
            df.groupby("Department")["AttritionFlag"].mean().mul(100).sort_values(ascending=False).index[0]
        ),
        "top_role": (
            df.groupby("JobRole")["AttritionFlag"].mean().mul(100).sort_values(ascending=False).index[0]
        ),
        "priority_count": int((scored["risk_tier"] == "High").sum()),
        "medium_count": int((scored["risk_tier"] == "Medium").sum()),
        "low_count": int((scored["risk_tier"] == "Low").sum()),
        "metrics": metrics,
    }
    (OUTPUT_DIR / "analysis_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")


def main() -> None:
    df = clean_data(DATA_PATH)
    df.to_csv(OUTPUT_DIR / "cleaned_ibm_hr_attrition.csv", index=False)
    save_eda_figures(df)
    _, metrics, scored = train_model(df)
    write_summary(df, metrics, scored)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()