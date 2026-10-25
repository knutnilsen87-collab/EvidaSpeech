<#
.SYNOPSIS
  Starter mock-motoren på en egen port, kjører frontendens kontraktstest mot den, og stopper den.
#>
param([int]$Port = 8799)
$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
$Py = Join-Path $Here '.venv\Scripts\python.exe'
if (-not (Test-Path $Py)) { Write-Host 'Mangler speech\.venv (se docs/SPEECH_CONTRACT.md).'; exit 1 }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("evidaspeech-contract-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
$pairing = Join-Path $tmp 'pairing.txt'
$proc = Start-Process -FilePath $Py -ArgumentList @('-B', (Join-Path $Here 'mock_engine.py'), '--port', $Port, '--data-dir', (Join-Path $tmp 'data'), '--pairing-file', $pairing) -PassThru -WindowStyle Hidden
try {
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path $pairing)) {
        if ((Get-Date) -gt $deadline -or $proc.HasExited) { throw 'Mock-motoren startet ikke.' }
        Start-Sleep -Milliseconds 200
    }
    do {
        try { $ok = (Invoke-RestMethod "http://127.0.0.1:$Port/v1/health").status -eq 'ok' } catch { $ok = $false }
        if (-not $ok) { Start-Sleep -Milliseconds 200 }
    } until ($ok -or (Get-Date) -gt $deadline)
    if (-not $ok) { throw 'Mock-motoren svarer ikke på /v1/health.' }

    $env:NSB_MOCK_URL = "http://127.0.0.1:$Port"
    $env:NSB_MOCK_PAIRING_FILE = $pairing
    Push-Location (Join-Path $Here '..\frontend')
    try { & npx vitest run src/speech/live-mock.test.ts; $code = $LASTEXITCODE } finally { Pop-Location }
    exit $code
}
finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
