<#
.SYNOPSIS
  Starter den ekte talemotoren (nsb-engine fra NorwegianSpeechBase) for EvidaSpeech.

.DESCRIPTION
  NorwegianSpeechBase brukes bare lesende: ingen pip install, ingen __pycache__,
  og nøkkel, økter og innsynslogg ligger under EvidaSpeech\speech\.data\engine.
  Tolken er NorwegianSpeechBase\.venv-bench (der faster-whisper og CUDA-bibliotekene
  allerede er installert), med mindre -Python er gitt.
  Motoren lytter bare på 127.0.0.1 og godtar bare EvidaSpeech (port 5174).
#>
param(
    [string]$NsbRoot = $(if ($env:NSB_ROOT) { $env:NSB_ROOT } else { 'F:\prosjekter_MAIN\NorwegianSpeechBase' }),
    [string]$Model = 'nb-whisper-large-distil-turbo-beta',
    [string]$Device = 'cuda',
    [int]$Port = 8766,
    [string]$Python = '',
    [string]$Decoding = 'standard'
)
$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
if (-not $Python) { $Python = Join-Path $NsbRoot '.venv-bench\Scripts\python.exe' }
if (-not (Test-Path $Python)) { Write-Host "Fant ikke Python-tolken $Python."; exit 1 }

# Modellstien leses fra NorwegianSpeechBase sitt modellregister (bare lesing).
$registry = Get-Content (Join-Path $NsbRoot 'eval\results\models.json') -Raw | ConvertFrom-Json
$rel = $registry.$Model.path
if (-not $rel -and (Test-Path (Join-Path $NsbRoot "models\finetuned\$Model\ct2\model.bin"))) { $rel = "models\finetuned\$Model\ct2" }
if (-not $rel) { Write-Host "Ukjent modell $Model."; exit 1 }
$modelPath = Join-Path $NsbRoot $rel
if (-not (Test-Path $modelPath)) { Write-Host "Fant ikke modellmappen $modelPath."; exit 1 }

$site = (& $Python -B -c "import sysconfig; print(sysconfig.get_paths()['purelib'])").Trim()
foreach ($sub in @('nvidia\cublas\bin', 'nvidia\cudnn\bin', 'nvidia\cuda_nvrtc\bin', 'nvidia\cuda_runtime\bin')) {
    $p = Join-Path $site $sub
    if (Test-Path $p) { $env:PATH = "$p;$env:PATH" }
}
$env:PYTHONPATH = $NsbRoot
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
$dataDir = Join-Path $Here '.data\engine'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$ct = if ($Device -eq 'cpu') { 'int8' } else { 'float16' }

& $Python -B -m nsb_engine.server --model $modelPath --label $Model --device $Device --compute-type $ct `
    --port $Port --decoding $Decoding --data-dir $dataDir `
    --allow-origin 'http://127.0.0.1:5174' --allow-origin 'http://localhost:5174' @args
