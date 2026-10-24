@echo off
rem Spill inn diktatsettet for fase 2b. Opptakene lagres bare i speech\recordings\2b.
rem Velg mikrofon: RUN_RECORD.cmd --list-devices, deretter RUN_RECORD.cmd --device N
"%~dp0..\.venv\Scripts\python.exe" -B "%~dp0record.py" %*
pause
