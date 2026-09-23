import io
from pathlib import Path
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app, DB_PATH

client = TestClient(app)


def make_csv(rows=3):
    data = {
        "EmployeeNumber": list(range(1, rows + 1)), "Age": [25, 40, 32][:rows],
        "Attrition": ["Yes", "No", "No"][:rows], "Department": ["Sales", "Sales", "HR"][:rows],
        "JobRole": ["Sales Rep", "Manager", "HR"][:rows], "MonthlyIncome": [3000, 8000, 5000][:rows],
        "OverTime": ["Yes", "No", "Yes"][:rows], "YearsAtCompany": [1, 10, 3][:rows],
        "JobSatisfaction": [1, 4, 3][:rows], "EnvironmentSatisfaction": [1, 4, 3][:rows],
        "WorkLifeBalance": [1, 4, 3][:rows], "JobLevel": [1, 4, 2][:rows],
        "StockOptionLevel": [0, 2, 1][:rows], "NumCompaniesWorked": [5, 1, 2][:rows],
        "DistanceFromHome": [20, 3, 8][:rows], "TotalWorkingYears": [2, 15, 8][:rows],
    }
    return pd.DataFrame(data).to_csv(index=False).encode()


def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_upload_changes_dataset():
    response = client.post("/api/dataset/upload", files={"file": ("custom.csv", make_csv(), "text/csv")})
    assert response.status_code == 200
    body = response.json()
    assert body["dataset"]["rowCount"] == 3
    assert body["analysis"]["population"] == 3
    assert body["analysis"]["attritionRate"] == 33.33
    assert len(client.get("/api/employees").json()) == 3


def test_upload_different_dataset_changes_analysis():
    first = client.post("/api/dataset/upload", files={"file": ("first.csv", make_csv(), "text/csv")})
    assert first.status_code == 200
    altered = pd.DataFrame({
        "EmployeeNumber": [10, 11, 12, 13], "Age": [25, 26, 27, 28],
        "Attrition": ["Yes", "Yes", "Yes", "No"], "Department": ["IT"] * 4,
        "JobRole": ["Engineer"] * 4, "MonthlyIncome": [3000] * 4, "OverTime": ["Yes"] * 4,
        "YearsAtCompany": [1, 1, 2, 10], "JobSatisfaction": [1, 1, 2, 4],
        "EnvironmentSatisfaction": [1, 1, 2, 4], "WorkLifeBalance": [1, 1, 2, 4],
        "JobLevel": [1, 1, 1, 3], "StockOptionLevel": [0, 0, 0, 2],
        "NumCompaniesWorked": [5, 5, 4, 1], "DistanceFromHome": [20, 20, 15, 2], "TotalWorkingYears": [2, 2, 3, 12],
    }).to_csv(index=False).encode()
    second = client.post("/api/dataset/upload", files={"file": ("second.csv", altered, "text/csv")})
    assert second.status_code == 200
    body = second.json()
    assert body["dataset"]["filename"] == "second.csv"
    assert body["analysis"]["population"] == 4
    assert body["analysis"]["attritionRate"] == 75.0
    assert client.get("/api/dataset").json()["filename"] == "second.csv"

def test_invalid_columns():
    bad = b"foo,bar\n1,2\n"
    response = client.post("/api/dataset/upload", files={"file": ("bad.csv", bad, "text/csv")})
    assert response.status_code == 400
