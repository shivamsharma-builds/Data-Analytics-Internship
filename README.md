# IBM HR Attrition Analytics — Full Stack

This package contains a React/Vite frontend, FastAPI backend, and a single all-in-one Jupyter notebook for the analytical workflow.

## Important: different CSV = different analysis

Upload a compatible CSV from the dashboard. The backend validates and normalizes the uploaded file, replaces the active dataset, recalculates employee risk signals, and returns fresh analysis. The frontend then reloads the new employee rows, so its KPIs, charts, filters, and risk table update to the uploaded data.

The notebook has the same behavior: set `CSV_SOURCE` to a different CSV or use its upload widget. It reruns data cleaning, EDA, model training/scoring, and output generation for that file.

## Run backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run frontend

```bash
cd artifacts/hr-attrition-analytics
npm install
npm run dev
```

Set `VITE_API_URL` if the backend is not on `http://localhost:8000`.

## Notebook

Open:

`project_submission/IBM_HR_Attrition_Analytics_ALL_IN_ONE.ipynb`

Use `CSV_SOURCE` for a path-based run or the interactive CSV upload cell in Jupyter/Colab.

## Validation

See `TEST_REPORT.md`. Backend tests pass and the all-in-one notebook executes successfully. The frontend production build was not marked as passed because dependency installation timed out in the build environment.
