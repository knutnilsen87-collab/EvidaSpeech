# Felles for start.ps1, stop.ps1 og build-saksrom.ps1. Dot-sources, kjøres ikke alene.

$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root 'logs'
$StateDir = Join-Path $Root '.data'
$RunFile = Join-Path $StateDir 'running.json'

function Read-Config([string]$Path) {
    $local = Join-Path $Root 'evidaspeech.local.json'
    $example = Join-Path $Root 'evidaspeech.example.json'
    if (-not $Path) { $Path = if (Test-Path $local) { $local } else { $example } }
    if (-not (Test-Path $Path)) { throw "Fant ikke konfigurasjonen $Path." }
    $cfg = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $cfg | Add-Member -NotePropertyName '_path' -NotePropertyValue (Resolve-Path $Path).Path
    return $cfg
}

# Relative stier i konfigurasjonen gjelder fra EvidaSpeech-mappen.
function Resolve-RootPath([string]$p) {
    if (-not $p) { return '' }
    if ([System.IO.Path]::IsPathRooted($p)) { return $p }
    return [System.IO.Path]::GetFullPath((Join-Path $Root $p))
}

function Read-Running {
    if (-not (Test-Path $RunFile)) { return @() }
    # Windows PowerShell 5.1 gir en JSON-liste som ett objekt; pakk den ut til elementene.
    $list = Get-Content $RunFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return @($list | ForEach-Object { $_ })
}

function Save-Running($entries) {
    New-Item -ItemType Directory -Force $StateDir | Out-Null
    $json = ConvertTo-Json @($entries) -Depth 4
    # Filen kan være låst et øyeblikk rett etter forrige skriving (for eksempel av virusskanneren).
    for ($i = 1; ; $i++) {
        try { [IO.File]::WriteAllText($RunFile, $json, (New-Object Text.UTF8Encoding $false)); return }
        catch { if ($i -ge 20) { throw }; Start-Sleep -Milliseconds 250 }
    }
}

# Prosessen med denne PID-en er den start.ps1 startet (ikke en senere prosess som har fått samme PID).
function Get-RecordedProcess($entry) {
    $p = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    try {
        if ($p -and $p.StartTime.ToUniversalTime().Ticks -eq [long]$entry.startTicks) { return $p }
    } catch {}
    return $null
}

# Stopper prosessene i -Entries (start.ps1 sin egen liste i minnet), ellers dem i running.json.
function Stop-Recorded($Entries = $null, [switch]$Quiet) {
    $ErrorActionPreference = 'Continue'
    $entries = if ($null -ne $Entries) { @($Entries) } else { @(Read-Running) }
    [array]::Reverse($entries)
    foreach ($e in $entries) {
        $p = Get-RecordedProcess $e
        if (-not $p) {
            if (-not $Quiet) { Write-Host ("  {0,-12} kjørte ikke lenger" -f $e.name) }
            continue
        }
        # /T tar med barneprosesser (for eksempel esbuild under Vite).
        & taskkill.exe /PID $e.pid /T /F 2>&1 | Out-Null
        try { $p.WaitForExit(10000) | Out-Null } catch {}
        if (-not $Quiet) { Write-Host ("  {0,-12} stoppet (pid {1})" -f $e.name, $e.pid) }
    }
    if (Test-Path $RunFile) { Remove-Item $RunFile -Force }
}

function Show-LogTail([string]$name, [int]$lines = 25) {
    foreach ($suffix in 'out', 'err') {
        $f = Join-Path $LogDir "$name.$suffix.log"
        if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) {
            Write-Host "---- siste linjer fra logs\$name.$suffix.log ----" -ForegroundColor DarkGray
            Get-Content $f -Tail $lines -Encoding UTF8 | ForEach-Object { Write-Host "  $_" }
        }
    }
}

function Get-BuildStamp {
    $ErrorActionPreference = 'Continue'
    $commit = (& git -C $Root rev-parse --short=10 HEAD 2>$null)
    if (-not $commit) { return 'ingen commit' }
    $dirty = (& git -C $Root --no-optional-locks status --porcelain 2>$null)
    $s = "$commit"
    if ($dirty) { $s += ' (+lokale endringer)' }
    return "$s · $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
