<#
.SYNOPSIS
  Stopper det start.ps1 startet (frontend, talemotor, saksrom-api), i motsatt rekkefølge.

.DESCRIPTION
  Bare prosessene som står i EvidaSpeech\.data\running.json, og bare hvis PID og
  starttidspunkt stemmer. Andre prosesser på de samme portene røres ikke.
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
$left = @($entries | Where-Object { Get-RecordedProcess $_ })
if ($left) {
    Write-Host "Fortsatt i gang: $(($left | ForEach-Object { "$($_.name) (pid $($_.pid))" }) -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host 'Alt er stoppet.' -ForegroundColor Green
exit 0
