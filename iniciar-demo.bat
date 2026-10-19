@echo off
REM Abre la maqueta en http://localhost:8000 para que el mapa de OpenStreetMap funcione.
REM No requiere instalar nada (usa PowerShell, incluido en Windows). Para cerrar cierra esta ventana
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 (
  echo.
  echo Intentando con Python...
  start "" http://localhost:8000/index.html
  python -m http.server 8000 || py -m http.server 8000
)
pause
