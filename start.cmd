@echo off
rem Starter hele EvidaSpeech. Valg: -Mock (mock-motor, ingen GPU), -NoSpeech, -NoBrowser.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "EVIDASPEECH_EXIT=%ERRORLEVEL%"
pause
exit /b %EVIDASPEECH_EXIT%
