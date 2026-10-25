@echo off
rem Stopper alt start.cmd startet.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
set "EVIDASPEECH_EXIT=%ERRORLEVEL%"
pause
exit /b %EVIDASPEECH_EXIT%
