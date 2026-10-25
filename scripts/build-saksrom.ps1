<#
.SYNOPSIS
  Bygger saksrom-api til EvidaSpeech\.build\saksrom-api\evida-api.jar uten å skrive i EvidaNy2.0.

.DESCRIPTION
  Maven skriver target\ ved siden av pom.xml. For at ingenting skal skrives i
  EvidaNy2.0, kopieres pom.xml, Maven-wrapperen og src\main til
  EvidaSpeech\.build\saksrom-api\kilde (gitignored), og bygget kjøres der.
  Koden endres ikke; kopien er bare byggemappe. Hvilken commit (og om
  arbeidstreet hadde lokale endringer) står i .build\saksrom-api\KILDE.txt.
  Maven-avhengigheter hentes til brukerens ~\.m2 som vanlig. Testene kjøres ikke her;
  de hører til EvidaNy2.0.
#>
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg = Read-Config $Config
$api = Join-Path (Resolve-RootPath $cfg.paths.evidaNy2) 'backend\saksrom-api'
if (-not (Test-Path (Join-Path $api 'pom.xml'))) { throw "Fant ikke saksrom-api i $api." }
$out = Join-Path $Root '.build\saksrom-api'
$src = Join-Path $out 'kilde'
$jar = Resolve-RootPath $cfg.paths.saksromJar

New-Item -ItemType Directory -Force $src | Out-Null
foreach ($f in 'pom.xml', 'mvnw.cmd') { Copy-Item (Join-Path $api $f) $src -Force }
# robocopy /MIR speiler mappene (fjerner filer som er slettet i kilden). Kode under 8 er OK.
foreach ($d in '.mvn', 'src\main') {
    & robocopy.exe (Join-Path $api $d) (Join-Path $src $d) /MIR /NJH /NJS /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Kopiering av $d feilet (robocopy $LASTEXITCODE)." }
}

$ErrorActionPreference = 'Continue'
$repo = Resolve-RootPath $cfg.paths.evidaNy2
# --no-optional-locks: git status skal ikke oppdatere indeksen i EvidaNy2.0.
$commit = (& git -C $repo --no-optional-locks rev-parse HEAD 2>$null)
$dirty = @(& git -C $repo --no-optional-locks status --porcelain -- backend/saksrom-api 2>$null)
@(
    "Kilde: $api",
    "Commit: $commit",
    "Lokale endringer i backend/saksrom-api: $(if ($dirty.Count) { "ja ($($dirty.Count) filer)" } else { 'nei' })",
    "Bygget: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) | Set-Content (Join-Path $out 'KILDE.txt') -Encoding UTF8

Push-Location $src
try {
    & cmd.exe /c "mvnw.cmd -B -q package -Dmaven.test.skip=true"
    $code = $LASTEXITCODE
} finally { Pop-Location }
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { throw "Maven-bygget feilet (kode $code)." }

$built = Get-ChildItem (Join-Path $src 'target') -Filter '*.jar' | Where-Object { $_.Name -notlike '*.original' } | Select-Object -First 1
if (-not $built) { throw 'Fant ingen jar etter bygget.' }
New-Item -ItemType Directory -Force (Split-Path $jar -Parent) | Out-Null
Copy-Item $built.FullName $jar -Force
Write-Host "Bygget $jar fra commit $commit$(if ($dirty.Count) { ' med lokale endringer' })." -ForegroundColor Green
