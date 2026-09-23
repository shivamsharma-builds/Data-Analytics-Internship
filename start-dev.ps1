$ErrorActionPreference = "Stop"
Write-Host "Starting HR Attrition Analytics backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn app.main:app --reload --port 8000"
Start-Sleep -Seconds 2
Write-Host "Starting HR Attrition Analytics frontend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\artifacts\hr-attrition-analytics"
npm install
npm run dev
