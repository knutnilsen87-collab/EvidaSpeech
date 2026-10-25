<#
.SYNOPSIS
  Stopper det start.ps1 startet (frontend, talemotor, saksrom-api, database), i motsatt rekkefølge.

.DESCRIPTION
  Bare det som står i EvidaSpeech\.data\running.json: prosesser hvis PID og
  starttidspunkt stemmer, og databasecontaineren bare hvis start.ps1 startet den
  (kjørte den fra før, for eksempel for EvidaNy2.0, får den stå). Andre prosesser
  på de samme portene røres ikke.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\common.ps1')

$entries = @(Read-Running)
if (-not $entries) {
    Write-Host 'Ingenting å stoppe: start.ps1 har ikke startet noe som fortsatt er registrert.'
    exit 0
}
Write-Host 'Stopper EvidaSpeech:'
Stop-Recorded
$left = @($entries | Where-Object { Test-EntryAlive $_ })
if ($left) {
    Write-Host "Fortsatt i gang: $(($left | ForEach-Object name) -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host 'Alt er stoppet.' -ForegroundColor Green
exit 0
