# IBM HR Employee Attrition — Flask + React Full Stack

A complete portfolio-ready employee attrition analytics application using the IBM HR Employee Attrition dataset.

## Stack

- Backend: Python, Flask, Flask-CORS
- Data: Pandas, NumPy
- Machine Learning: scikit-learn Logistic Regression
- Frontend: React + Vite
- Charts: Recharts

## Dataset

Use the Kaggle IBM HR Employee Attrition CSV. The dashboard accepts the CSV through **Upload IBM HR CSV**.

The application expects the standard IBM HR columns, including `Attrition`, `Department`, `JobRole`, and `OverTime`.

## Features

1. Dataset upload and validation
2. KPI dashboard
3. Attrition rate analysis
4. Department, job-role, overtime, travel and marital-status analysis
5. Age-level attrition trend
6. Logistic Regression model
7. Accuracy, precision, recall, F1 and ROC-AUC
8. Confusion matrix
9. Employee churn-risk scoring
10. REST API through Flask

## Run on Windows

### Terminal 1 — Flask backend

Double-click:

`run_backend.bat`

Or manually:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Backend:

`http://localhost:8000`

Health check:

`http://localhost:8000/api/health`

### Terminal 2 — React frontend

Double-click:

`run_frontend.bat`

Or manually:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

`http://localhost:5173`

## API

- `GET /api/health`
- `GET /api/overview`
- `GET /api/eda`
- `GET /api/model`
- `POST /api/train`
- `POST /api/upload`
- `POST /api/predict`

## Important

The model is retrained from the currently uploaded dataset so the frontend and backend remain synchronized.

This project is intended for analytics/educational use. HR predictions should not be treated as the sole basis for employment decisions.
