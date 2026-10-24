@echo off
rem Starter talemotoren med skriptet modell (ingen GPU, ingen lyd tolkes). Stopp med Ctrl+C.
if not exist "%~dp0.venv\Scripts\python.exe" (
  echo Mangler speech\.venv. Kjor: py -3.11 -m venv speech\.venv ^&^& speech\.venv\Scripts\pip install -r speech\requirements.txt
  pause
  exit /b 1
)
"%~dp0.venv\Scripts\python.exe" -B "%~dp0mock_engine.py" %*
pause
