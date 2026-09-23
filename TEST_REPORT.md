# Final validation report

## Backend
- `python -m pytest -q`: **4 passed**
- Uploading a different CSV changes dataset metadata, population, attrition rate, and employee rows.
- Required-column validation rejects incompatible CSV files.
- CSV normalization supports common header aliases.

## Notebook
- `IBM_HR_Attrition_Analytics_ALL_IN_ONE.ipynb` is the single analytical notebook.
- Executed end-to-end with `nbconvert --execute`: **PASS**.
- Notebook supports changing `CSV_SOURCE` or uploading a CSV with the widget; EDA, model, risk scores, and summaries are recomputed.

## Frontend
- Upload flow posts the CSV to the backend and reloads the employee dataset.
- Dashboard KPIs, charts, filters, and risk table are derived from the current loaded employee rows, so they change after upload.
- Production TypeScript/Vite build could not be completed in this environment because `npm install` timed out while fetching dependencies. No claim of a successful production build is made.
