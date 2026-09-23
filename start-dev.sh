#!/usr/bin/env bash
set -e
(cd backend && python -m uvicorn app.main:app --reload --port 8000) &
cd artifacts/hr-attrition-analytics
npm install
npm run dev
