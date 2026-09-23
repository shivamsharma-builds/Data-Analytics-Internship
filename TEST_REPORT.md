# Final Build Test Report

## Automated checks

### Backend API — PASS

Executed from `backend`:

```text
python -m pytest -q tests/test_api.py
```

Result: **3 passed**.

Covered:
- health endpoint
- CSV upload and dataset replacement
- dynamic analysis values
- invalid CSV column validation

### Analytics pipeline — PASS

Executed:

```text
python project_submission/run_pipeline.py
```

Results:

- Records: 1,470
- Observed attrition: 16.12%
- Train/test split: 1,176 / 294
- Accuracy: 0.7551
- Precision: 0.3563
- Recall: 0.6596
- ROC AUC: 0.7958
- Confusion matrix: [[191, 56], [16, 31]]

### Report generation — PASS

Executed successfully:

```text
python project_submission/generate_report.py
python project_submission/generate_presentation.py
```

Both DOCX and PPTX outputs were regenerated.

### Notebook execution — PASS

The notebook was executed end-to-end with `nbclient` using the Python 3 kernel without execution errors. The notebook file was normalized after execution to avoid missing-cell-ID compatibility warnings in newer nbformat versions.

### Frontend source validation — PASS

Static checks confirmed:
- all local TypeScript/TSX imports resolve to files in the final source tree
- Vite and TypeScript configuration are present
- no Replit-specific configuration remains
- npm scripts are present for `dev`, `build`, `preview`, and `typecheck`
- unused UI component source files and the duplicate bundled CSV were removed

### Frontend production build — NOT EXECUTED

A fresh `npm install` was attempted twice, but the environment could not complete access to the npm registry within the available execution window. Therefore `npm run typecheck` and `npm run build` could not be truthfully reported as executed in this environment.

Run these commands on an internet-connected machine before deployment:

```powershell
cd artifacts\hr-attrition-analytics
npm install
npm run typecheck
npm run build
```

## Cleanup performed

Removed from the final package:
- unused Radix/UI component files: dialog, label, separator, sheet, textarea, toggle
- duplicate frontend CSV under `artifacts/hr-attrition-analytics/public/data`
- generated runtime SQLite database
- Python cache files
- pytest cache
- local `node_modules` / frontend `dist` build output

The source package therefore contains source/configuration, testable backend code, analytics inputs/outputs, and final report artifacts without local runtime/build caches.
