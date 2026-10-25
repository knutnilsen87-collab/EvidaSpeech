<#
.SYNOPSIS
  Starter hele EvidaSpeech: saksrom-api, talemotoren og frontenden.

.DESCRIPTION
  Sjekker forutsetningene først og starter ingenting hvis noe mangler.
  Deretter startes tjenestene i rekkefølge, og hver må svare på helsesjekken
  før neste startes:
    1. saksrom-api (ferdigbygd jar fra EvidaNy2.0-koden, /actuator/health)
    2. nsb-engine, ekte modell eller mock med -Mock (/v1/health)
    3. Vite-frontenden
  Feiler en tjeneste, stoppes de som allerede er startet, og de siste
  linjene fra loggen vises (fail-closed).

  Ingenting skrives i EvidaNy2.0 eller NorwegianSpeechBase. saksrom-api kjører
  med arbeidsmappe og karantenemappe under EvidaSpeech\.data\saksrom.
  Logger: EvidaSpeech\logs\<tjeneste>.out.log og .err.log. Stopp med stop.ps1.

  Konfigurasjon: evidaspeech.local.json (gitignored), ellers standardverdiene i
  evidaspeech.example.json. Passordet til databasen leses fra miljøvariabelen
  som database.passwordEnv peker på, eller fra database.password i den lokale
  konfigurasjonen.
#>
param(
    [switch]$Mock,
    [switch]$NoSpeech,
    [switch]$NoBrowser,
    [string]$Config = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\common.ps1')

function Quote-Arg([string]$a) {
    if ($a -eq '' -or $a -match '[\s"]') { return '"' + ($a -replace '"', '\"') + '"' }
    return $a
}

function Test-PortFree([int]$port) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { return $null }
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    return "$($proc.ProcessName) (pid $($c.OwningProcess))"
}

# Svarer det PostgreSQL på adressen? Sender en SSLRequest; PostgreSQL svarer 'S' eller 'N'.
function Test-Postgres([string]$hostName, [int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $client.BeginConnect($hostName, $port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(2000)) { return 'svarer ikke' }
        $client.EndConnect($connect)
        $stream = $client.GetStream()
        $stream.ReadTimeout = 2000
        $stream.Write([byte[]](0, 0, 0, 8, 4, 210, 22, 47), 0, 8)
        $b = $stream.ReadByte()
        if ($b -eq 83 -or $b -eq 78) { return $null }
        return 'svarer, men ikke som PostgreSQL'
    } catch {
        return 'svarer ikke'
    } finally {
        $client.Close()
    }
}

# Kjører et program og gir utdata (stdout og stderr) uten at stderr blir en feil i Windows PowerShell 5.1.
function Invoke-Native([string]$exe, [string[]]$argList) {
    $ErrorActionPreference = 'Continue'
    $output = & $exe @argList 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ ok = ($LASTEXITCODE -eq 0); output = @($output) }
}

# Svar som { StatusCode, Content }. Content er alltid tekst: Windows PowerShell 5.1 gir byte[]
# når innholdstypen ikke er text/* eller application/json (for eksempel Spring Actuator sin).
function Get-Http([string]$url) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
        $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { "$($r.Content)" }
        return [pscustomobject]@{ StatusCode = $r.StatusCode; Content = $text }
    } catch { return $null }
}

function Start-Tracked($name, $exe, [string[]]$argList, $cwd, [hashtable]$envVars, $url) {
    New-Item -ItemType Directory -Force $LogDir | Out-Null
    $out = Join-Path $LogDir "$name.out.log"
    $err = Join-Path $LogDir "$name.err.log"
    foreach ($f in $out, $err) {
        if (Test-Path $f) { Move-Item $f ($f -replace '\.log$', '.prev.log') -Force }
    }
    # Start-Process i Windows PowerShell 5.1 har ikke -Environment; barnet arver
    # miljøet til denne prosessen, som settes midlertidig og settes tilbake.
    $saved = @{}
    foreach ($k in $envVars.Keys) {
        $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
        [Environment]::SetEnvironmentVariable($k, $envVars[$k], 'Process')
    }
    try {
        $p = Start-Process -FilePath $exe -ArgumentList (($argList | ForEach-Object { Quote-Arg $_ }) -join ' ') `
            -WorkingDirectory $cwd -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    # Først i minnet (fail-closed stopper fra listen), så til fil for stop.ps1.
    $script:running += [pscustomobject]@{ name = $name; pid = $p.Id; startTicks = $p.StartTime.ToUniversalTime().Ticks; url = $url }
    Save-Running $script:running
    return $p
}

function Wait-Healthy($name, $proc, [string]$url, [scriptblock]$ok, [int]$timeout) {
    $t0 = Get-Date
    Write-Host ("  {0,-12} venter på {1} " -f $name, $url) -NoNewline
    while (((Get-Date) - $t0).TotalSeconds -lt $timeout) {
        if ($proc.HasExited) {
            Write-Host ''
            throw "$name avsluttet med kode $($proc.ExitCode) før den svarte."
        }
        $r = Get-Http $url
        if ($r -and $r.StatusCode -eq 200 -and (& $ok $r)) {
            Write-Host ("klar ({0:N0} s)" -f ((Get-Date) - $t0).TotalSeconds) -ForegroundColor Green
            return $r
        }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 1
    }
    Write-Host ''
    throw "$name svarte ikke på $url innen $timeout s."
}

# ---------------------------------------------------------------- konfigurasjon
$cfg = Read-Config $Config
$usingExample = $cfg._path -like '*evidaspeech.example.json'
$speech = -not $NoSpeech
if ($NoSpeech -and $Mock) { Write-Host '-NoSpeech er valgt, så -Mock har ingen virkning.' -ForegroundColor Yellow }

$evidaNy = Resolve-RootPath $cfg.paths.evidaNy2
$nsbRoot = Resolve-RootPath $cfg.paths.nsbRoot
$jar = Resolve-RootPath $cfg.paths.saksromJar
$apiPort = [int]$cfg.ports.api
$enginePort = [int]$cfg.ports.engine
$frontPort = [int]$cfg.ports.frontend
$frontUrl = "http://127.0.0.1:$frontPort/"
$apiUrl = "http://127.0.0.1:$apiPort"
$engineUrl = "http://127.0.0.1:$enginePort"
$origins = @("http://127.0.0.1:$frontPort", "http://localhost:$frontPort")
$frontendDir = Join-Path $Root 'frontend'

Write-Host ''
Write-Host 'EvidaSpeech · oppstart' -ForegroundColor Cyan
Write-Host "  Konfigurasjon: $($cfg._path)$(if ($usingExample) { '  (standardverdier; kopier til evidaspeech.local.json for å endre)' })"
Write-Host ''

# ---------------------------------------------------------------- forutsetninger
$problems = New-Object System.Collections.Generic.List[object]
function Add-Problem($what, $fix) { $problems.Add([pscustomobject]@{ what = $what; fix = $fix }) }

$already = @(Read-Running | Where-Object { Test-EntryAlive $_ })
if ($already) {
    Add-Problem "EvidaSpeech kjører allerede ($(($already | ForEach-Object name) -join ', '))." 'Stopp først med stop.cmd (eller stop.ps1).'
}

if (-not (Test-Path (Join-Path $evidaNy 'backend\saksrom-api\pom.xml'))) {
    Add-Problem "Fant ikke EvidaNy2.0 (saksrom-api) i $evidaNy." 'Sett paths.evidaNy2 i evidaspeech.local.json.'
}
if ($speech -and -not (Test-Path (Join-Path $nsbRoot 'nsb_engine\server.py'))) {
    Add-Problem "Fant ikke NorwegianSpeechBase (nsb_engine) i $nsbRoot." 'Sett paths.nsbRoot i evidaspeech.local.json, eller start med -NoSpeech.'
}

# Java 21
$java = if ($cfg.paths.javaHome) { Join-Path (Resolve-RootPath $cfg.paths.javaHome) 'bin\java.exe' } else { (Get-Command java.exe -ErrorAction SilentlyContinue).Source }
if (-not $java -or -not (Test-Path $java)) {
    Add-Problem 'Java ble ikke funnet.' 'Installer Java 21 (for eksempel Eclipse Temurin 21) og legg den i PATH, eller sett paths.javaHome.'
} else {
    $javaVersion = (Invoke-Native $java @('-version')).output | Select-Object -First 1
    if ($javaVersion -notmatch 'version "21[\.\"]') {
        Add-Problem "saksrom-api krever Java 21, fant: $javaVersion ($java)." 'Installer Java 21 og sett paths.javaHome til den.'
    }
}

# Node og frontendens avhengigheter
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Add-Problem 'Node.js ble ikke funnet.' 'Installer Node.js 20 eller nyere.'
} else {
    $nodeVersion = "$((Invoke-Native $node @('-v')).output)".Trim()
    if ([int](($nodeVersion -replace '^v', '').Split('.')[0]) -lt 18) { Add-Problem "Node.js er for gammel ($nodeVersion)." 'Installer Node.js 20 eller nyere.' }
}
$viteJs = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteJs)) { Add-Problem 'Frontendens avhengigheter er ikke installert.' 'Kjør: cd frontend; npm install' }

# Python for talemotoren
$speechPython = Resolve-RootPath $cfg.paths.speechPython
$engineExe = $null; $engineArgs = @(); $engineEnv = @{}
if ($speech) {
    $baseEnv = @{ PYTHONDONTWRITEBYTECODE = '1'; PYTHONIOENCODING = 'utf-8'; PYTHONUTF8 = '1'; PYTHONUNBUFFERED = '1' }
    if ($Mock) {
        if (-not (Test-Path $speechPython)) {
            Add-Problem "Fant ikke EvidaSpeechs Python-miljø ($speechPython)." 'Kjør: py -3.11 -m venv speech\.venv; speech\.venv\Scripts\pip install -r speech\requirements.txt'
        } else {
            if (-not (Invoke-Native $speechPython @('-B', '-c', 'import fastapi, uvicorn, numpy, websockets, cryptography')).ok) { Add-Problem 'Python-miljøet speech\.venv mangler pakker.' 'Kjør: speech\.venv\Scripts\pip install -r speech\requirements.txt' }
        }
        $engineExe = $speechPython
        $engineArgs = @('-B', (Join-Path $Root 'speech\mock_engine.py'), '--port', "$enginePort") + ($origins | ForEach-Object { '--allow-origin', $_ })
        $engineEnv = $baseEnv + @{ NSB_ROOT = $nsbRoot }
    } else {
        $nsbPython = if ($cfg.paths.nsbPython) { Resolve-RootPath $cfg.paths.nsbPython } else { Join-Path $nsbRoot '.venv-bench\Scripts\python.exe' }
        $modelDir = Resolve-RootPath $cfg.engine.modelDir
        if (-not $modelDir) {
            # Modellstien leses fra NorwegianSpeechBase sitt modellregister (bare lesing).
            $registryFile = Join-Path $nsbRoot 'eval\results\models.json'
            if (Test-Path $registryFile) {
                $rel = (Get-Content $registryFile -Raw -Encoding UTF8 | ConvertFrom-Json).($cfg.engine.model).path
                if ($rel) { $modelDir = Join-Path $nsbRoot $rel }
            }
            if (-not $modelDir -and (Test-Path (Join-Path $nsbRoot "models\finetuned\$($cfg.engine.model)\ct2\model.bin"))) {
                $modelDir = Join-Path $nsbRoot "models\finetuned\$($cfg.engine.model)\ct2"
            }
        }
        if (-not (Test-Path $nsbPython)) {
            Add-Problem "Fant ikke Python-tolken for den ekte motoren ($nsbPython)." 'Sett paths.nsbPython, eller start med -Mock.'
        } else {
            if (-not (Invoke-Native $nsbPython @('-B', '-c', 'import faster_whisper, fastapi, uvicorn')).ok) { Add-Problem "Tolken $nsbPython mangler faster-whisper eller FastAPI." 'Bruk en tolk med pakkene (paths.nsbPython), eller start med -Mock.' }
        }
        if (-not $modelDir -or -not (Test-Path (Join-Path $modelDir 'model.bin'))) {
            Add-Problem "Fant ikke modellmappen for $($cfg.engine.model) ($modelDir)." 'Sett engine.modelDir til en mappe med CTranslate2-modell (model.bin), eller start med -Mock.'
        }
        $engineExe = $nsbPython
        $ct = if ($cfg.engine.device -eq 'cpu') { 'int8' } else { 'float16' }
        $engineArgs = @('-B', '-m', 'nsb_engine.server', '--model', $modelDir, '--label', $cfg.engine.model,
            '--device', $cfg.engine.device, '--compute-type', $ct, '--port', "$enginePort",
            '--data-dir', (Join-Path $Root 'speech\.data\engine')) + ($origins | ForEach-Object { '--allow-origin', $_ })
        $path = $env:PATH
        if (Test-Path $nsbPython) {
            $site = "$((Invoke-Native $nsbPython @('-B', '-c', "import sysconfig; print(sysconfig.get_paths()['purelib'])")).output | Select-Object -First 1)".Trim()
            foreach ($sub in 'nvidia\cublas\bin', 'nvidia\cudnn\bin', 'nvidia\cuda_nvrtc\bin', 'nvidia\cuda_runtime\bin') {
                if (Test-Path (Join-Path $site $sub)) { $path = (Join-Path $site $sub) + ";$path" }
            }
        }
        $engineEnv = $baseEnv + @{ PYTHONPATH = $nsbRoot; PATH = $path }
    }
}

# saksrom-api: ferdig jar. start.ps1 bygger aldri (det ville skrevet target\ i EvidaNy2.0).
if (-not (Test-Path $jar)) {
    Add-Problem "Fant ikke ferdigbygd saksrom-api ($jar)." ("Bygg fra en kopi under EvidaSpeech\.build med scripts\build-saksrom.ps1 (skriver ingenting i EvidaNy2.0), " +
        'eller sett paths.saksromJar til en ferdig jar.')
}
# Commit jaren er bygd fra (fra build-saksrom.ps1), vises i statuslinjen og build-stempelet.
$saksromInfo = Get-SaksromInfo $jar
$saksromCommit = if ($saksromInfo) { "$($saksromInfo.commit)" } else { '' }

# PostgreSQL. Med database.docker startes EvidaNy2.0 sin utviklingsdatabase (container) i
# oppstarten, hvis den ikke svarer allerede. Docker Desktop startes eller installeres ikke.
$dbUrl = "$($cfg.database.url)"
$dock = $cfg.database.docker
$composeFile = if ($dock -and $dock.composeFile) {
    if ([IO.Path]::IsPathRooted($dock.composeFile)) { $dock.composeFile } else { Join-Path $evidaNy $dock.composeFile }
} else { '' }
$startDb = $false
if ($dbUrl -match '^jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?;]+)') {
    $dbHost = $Matches[1]; $dbPort = if ($Matches[2]) { [int]$Matches[2] } else { 5432 }; $dbName = $Matches[3]
    $pg = Test-Postgres $dbHost $dbPort
    if ($pg -and $composeFile) {
        if (-not (Test-Path $composeFile)) {
            Add-Problem "Fant ikke compose-filen for databasen ($composeFile)." 'Sett database.docker.composeFile, eller fjern database.docker og bruk en installert PostgreSQL.'
        } elseif (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
            Add-Problem "PostgreSQL $pg på ${dbHost}:$dbPort, og Docker er ikke installert." 'start.ps1 installerer ingenting. Installer Docker Desktop, eller installer PostgreSQL 16 og fjern database.docker.'
        } elseif (-not (Invoke-Docker @('info', '--format', '{{.ServerVersion}}')).ok) {
            Add-Problem 'Docker Desktop kjører ikke, så databasen kan ikke startes.' 'Start Docker Desktop, vent til den er klar, og prøv igjen. start.ps1 starter ikke Docker Desktop selv.'
        } elseif (Test-ContainerRunning $dock.container) {
            Add-Problem "Containeren $($dock.container) kjører, men PostgreSQL $pg på ${dbHost}:$dbPort." "Se docker logs $($dock.container)."
        } else {
            $startDb = $true
        }
    } elseif ($pg) {
        $services = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'postgres*' })
        $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
        $fix = if ($services) {
            "PostgreSQL-tjenesten $($services[0].Name) er $($services[0].Status). Start den (Start-Service $($services[0].Name)) og prøv igjen."
        } else {
            "Ingen PostgreSQL-tjeneste er installert, og start.ps1 installerer ingenting. saksrom-api trenger PostgreSQL 16 på ${dbHost}:$dbPort " +
            "med databasen og brukeren i database.url / database.user. Installer PostgreSQL 16" +
            $(if ($docker) { ", eller start EvidaNy2.0 sin utviklingsdatabase i Docker: docker compose -f `"$evidaNy\backend\saksrom-api\docker-compose.yml`" up -d postgres" } else { '' }) + '.'
        }
        Add-Problem "PostgreSQL $pg på ${dbHost}:$dbPort." $fix
    }
} else {
    Add-Problem "database.url er ikke en PostgreSQL-adresse: $dbUrl" 'Bruk formen jdbc:postgresql://127.0.0.1:5432/evida.'
}
$dbPassword = $null
if ($cfg.database.passwordEnv) { $dbPassword = [Environment]::GetEnvironmentVariable($cfg.database.passwordEnv) }
if (-not $dbPassword -and $cfg.database.password) { $dbPassword = $cfg.database.password }

# Porter
$ports = [ordered]@{ 'saksrom-api' = $apiPort; 'frontend' = $frontPort }
if ($speech) { $ports.Insert(1, 'talemotor', $enginePort) }
foreach ($svc in $ports.Keys) {
    $owner = Test-PortFree $ports[$svc]
    if ($owner) { Add-Problem "Port $($ports[$svc]) ($svc) er i bruk av $owner." 'Stopp det som bruker porten, eller velg en annen port under ports i evidaspeech.local.json.' }
}

if ($problems.Count) {
    Write-Host "Kan ikke starte. $($problems.Count) forutsetning(er) mangler:" -ForegroundColor Red
    foreach ($p in $problems) {
        Write-Host "  - $($p.what)" -ForegroundColor Red
        Write-Host "    Slik fikser du det: $($p.fix)"
    }
    Write-Host ''
    Write-Host 'Ingenting ble startet.'
    exit 1
}
Write-Host '  Forutsetninger OK.' -ForegroundColor Green

# ---------------------------------------------------------------- oppstart
$script:running = @()
$current = $null
$done = $false
try {
    # 0. database (bare hvis den ikke svarte i sjekken og database.docker er satt)
    if ($startDb) {
        $current = 'postgres'
        Write-Host ("  {0,-12} starter container {1}" -f 'postgres', $dock.container)
        # Samme compose-fil og prosjekt som EvidaNy2.0 bruker; filen leses bare. --no-recreate: en
        # eksisterende container (og volumet med data) brukes som den er.
        $r = Invoke-Docker @('compose', '-f', $composeFile, 'up', '-d', '--no-recreate', $dock.service)
        New-Item -ItemType Directory -Force $LogDir | Out-Null
        $r.output | Set-Content (Join-Path $LogDir 'postgres.out.log') -Encoding UTF8
        if (-not $r.ok) { throw "docker compose up feilet." }
        $script:running += [pscustomobject]@{ name = 'postgres'; kind = 'docker'; container = $dock.container; url = "${dbHost}:$dbPort" }
        Save-Running $script:running
        $t0 = Get-Date; $timeout = [int]$cfg.timeoutsSeconds.database
        Write-Host ("  {0,-12} venter på pg_isready og {1}:{2} " -f 'postgres', $dbHost, $dbPort) -NoNewline
        while ($true) {
            $ready = (Invoke-Docker @('exec', $dock.container, 'pg_isready', '-U', "$($cfg.database.user)", '-d', $dbName)).ok
            if ($ready -and -not (Test-Postgres $dbHost $dbPort)) { break }
            if (((Get-Date) - $t0).TotalSeconds -ge $timeout) {
                Write-Host ''
                (Invoke-Docker @('logs', '--tail', '40', $dock.container)).output | Add-Content (Join-Path $LogDir 'postgres.out.log') -Encoding UTF8
                throw "PostgreSQL ble ikke klar innen $timeout s."
            }
            Write-Host '.' -NoNewline
            Start-Sleep -Seconds 1
        }
        Write-Host ("klar ({0:N0} s)" -f ((Get-Date) - $t0).TotalSeconds) -ForegroundColor Green
    }

    # a. saksrom-api
    $current = 'saksrom-api'
    $apiData = Join-Path $StateDir 'saksrom'
    New-Item -ItemType Directory -Force (Join-Path $apiData 'quarantine') | Out-Null
    $apiEnv = @{
        EVIDA_API_PORT                    = "$apiPort"
        DATABASE_URL                      = $dbUrl
        DATABASE_USER                     = "$($cfg.database.user)"
        EVIDA_LOCAL_DEV_MODE              = 'true'
        EVIDA_ALLOWED_ORIGINS             = ($origins -join ',')
        EVIDA_RAW_DOCUMENT_UPLOAD_ALLOWED = 'true'
        EVIDA_AI_PROVIDER_CALLS_ENABLED   = 'false'
        EVIDA_STORAGE_QUARANTINE_ROOT     = (Join-Path $apiData 'quarantine')
    }
    if ($dbPassword) { $apiEnv.DATABASE_PASSWORD = $dbPassword }
    $tessdata = Join-Path $evidaNy 'backend\saksrom-api\data\tessdata'
    if (Test-Path $tessdata) { $apiEnv.EVIDA_TESSDATA_PATH = $tessdata }
    $p = Start-Tracked 'saksrom-api' $java @('-jar', $jar) $apiData $apiEnv $apiUrl
    $null = Wait-Healthy 'saksrom-api' $p "$apiUrl/actuator/health" { param($r) $r.Content -match '"status"\s*:\s*"UP"' } ([int]$cfg.timeoutsSeconds.api)

    # b. talemotor
    $engineHealth = $null
    if ($speech) {
        $current = 'talemotor'
        $p = Start-Tracked 'talemotor' $engineExe $engineArgs (Join-Path $Root 'speech') $engineEnv $engineUrl
        $r = Wait-Healthy 'talemotor' $p "$engineUrl/v1/health" { param($r) $r.Content -match '"service"\s*:\s*"nsb-engine"' } ([int]$cfg.timeoutsSeconds.engine)
        $engineHealth = $r.Content | ConvertFrom-Json
    }

    # c. frontend
    $current = 'frontend'
    $frontEnv = @{ EVIDASPEECH_API_URL = $apiUrl; VITE_NSB_ENGINE_URL = $engineUrl; EVIDASPEECH_SAKSROM_COMMIT = $saksromCommit }
    $p = Start-Tracked 'frontend' $node @($viteJs, '--host', '127.0.0.1', '--port', "$frontPort", '--strictPort') $frontendDir $frontEnv $frontUrl
    $null = Wait-Healthy 'frontend' $p $frontUrl { param($r) $true } ([int]$cfg.timeoutsSeconds.frontend)
    $done = $true
} catch {
    Write-Host ''
    Write-Host "FEIL: $($_.Exception.Message)" -ForegroundColor Red
    if ($current) { Show-LogTail $current }
    Write-Host ''
    Write-Host 'Stopper det som ble startet:'
} finally {
    # Også ved Ctrl+C: ingenting blir liggende halvstartet. Listen i minnet brukes, så en
    # tjeneste stoppes selv om running.json ikke ble oppdatert etter at den startet.
    if (-not $done) { Stop-Recorded -Entries $script:running }
}
if (-not $done) { exit 1 }

# ---------------------------------------------------------------- status
if (-not $NoBrowser) { Start-Process $frontUrl }
$speechText = if (-not $speech) { 'av (-NoSpeech)' } else { "$($engineHealth.model) · $($engineHealth.device)" }
Write-Host ''
$apiText = if ($saksromCommit) { "saksrom-api :$apiPort ($($saksromCommit.Substring(0, 10)))" } else { "saksrom-api :$apiPort (ukjent bygg)" }
$dbText = if ($startDb) { "db $($dock.container)" } else { "db ${dbHost}:$dbPort" }
Write-Host ("EvidaSpeech kjører · {0} · {1} · tale: {2} · frontend {3} · build {4}" -f $dbText, $apiText, $speechText, $frontUrl, (Get-BuildStamp)) -ForegroundColor Green
if ($speech) {
    $pairing = Get-Content (Join-Path $LogDir 'talemotor.out.log') -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ -match 'Paringskode' } | Select-Object -First 1
    if ($pairing) { Write-Host "  $($pairing.Trim())  (trengs bare første gang nettleseren kobles til motoren)" }
}
Write-Host '  Logger i logs\. Stopp alt med stop.cmd.'
exit 0
