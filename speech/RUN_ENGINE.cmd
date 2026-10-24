@echo off
rem Starter den ekte talemotoren (krever skjermkort). Stopp med Ctrl+C.
set "NSB_PS="
where pwsh >NUL 2>NUL && set "NSB_PS=pwsh"
if not defined NSB_PS set "NSB_PS=powershell"
"%NSB_PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_engine.ps1" %*
pause
