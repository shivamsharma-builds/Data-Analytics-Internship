# IBM HR Attrition Analytics — Full Stack

A complete HR attrition analytics application with a React dashboard, FastAPI backend, SQLite persistence, and CSV upload. The uploaded CSV becomes the active dataset and all dashboard metrics, charts, filters, and risk rows are recalculated from it.

## Architecture

- **Frontend:** React + Vite + Recharts
- **Backend:** FastAPI + Python
- **Database:** SQLite
- **Data processing:** pandas
- **API:** REST/JSON
- **Upload:** multipart CSV endpoint with validation and persistence

## Run in VS Code / PowerShell

### Terminal 1 — backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Backend:
- http://localhost:8000
- Swagger API docs: http://localhost:8000/docs

### Terminal 2 — frontend

```powershell
cd artifacts\hr-attrition-analytics
npm install
npm run dev
```

Open http://localhost:5173/

The frontend uses `http://localhost:8000` by default. To change it, copy `.env.example` to `.env` and set `VITE_API_URL`.

## CSV upload

Click **Upload CSV** in the dashboard. The browser sends the file to the backend. The backend:

1. Validates the CSV.
2. Normalizes common column-name variations.
3. Calculates transparent employee prioritization signals.
4. Replaces the active dataset in SQLite.
5. Returns the new dataset metadata and analysis.
6. The dashboard refreshes and recalculates its charts, filters, KPIs, and employee table.

Required columns:

`Attrition, Department, JobRole, OverTime, JobSatisfaction, EnvironmentSatisfaction, WorkLifeBalance, YearsAtCompany, JobLevel, StockOptionLevel, NumCompaniesWorked, DistanceFromHome`

Optional columns include `EmployeeNumber, Age, MonthlyIncome, TotalWorkingYears`.

The application intentionally does not make employment decisions. Risk scores are transparent prioritization signals for human review.

## API endpoints

- `GET /api/health`
- `GET /api/dataset`
- `GET /api/employees`
- `GET /api/analysis`
- `POST /api/dataset/upload`
- `POST /api/dataset/reset`
- `GET /api/export`

## Backend tests

```powershell
cd backend
python -m pytest -q
```

The test suite covers health, CSV upload/dataset replacement, dynamic analysis, and invalid-column validation.

## One-command PowerShell launcher

From the project root:

```powershell
.\start-dev.ps1
```

This opens the backend in a second PowerShell window and starts the frontend in the current terminal.
