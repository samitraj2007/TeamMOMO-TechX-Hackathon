# Starts backend (uvicorn) and frontend (production build) for the live demo.
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Building frontend (production)..."
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "frontend build failed" }
Pop-Location

$api = Start-Process -FilePath "$root\.venv\Scripts\python.exe" `
  -ArgumentList '-m', 'uvicorn', 'backend.app.main:app', '--port', '8000' `
  -WorkingDirectory $root -PassThru
$web = Start-Process -FilePath "cmd.exe" -ArgumentList '/c', 'npm run start' `
  -WorkingDirectory "$root\frontend" -PassThru

Start-Sleep 5
Write-Host "API  pid $($api.Id)  http://127.0.0.1:8000/health"
Write-Host "Web  pid $($web.Id)  http://localhost:3000"
Write-Host "Next: python scripts\smoke.py"
