@echo off
rem Mål ventetid og ordfeilrate. Den ekte motoren må kjøre (speech\RUN_ENGINE.cmd).
"%~dp0..\.venv\Scripts\python.exe" -B "%~dp0measure.py" %*
pause
