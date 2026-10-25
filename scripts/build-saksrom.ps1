<#
.SYNOPSIS
  Bygger saksrom-api til EvidaSpeech\.build\saksrom-api\evida-api.jar fra siste commit i EvidaNy2.0.

.DESCRIPTION
  Koden hentes med «git archive» av en commit (standard HEAD), ikke fra
  arbeidstreet, så ukommittert arbeid i EvidaNy2.0 kommer ikke med. git archive
  bare leser repoet; ingenting skrives i EvidaNy2.0 (heller ikke i .git, slik
  git worktree ville gjort). Arkivet pakkes ut i .build\saksrom-api\kilde
  (gitignored) og bygges der med Maven-wrapperen fra samme commit.
  Hvilken commit jaren er bygd fra, står i .build\saksrom-api\KILDE.json; start.ps1
  viser den i statuslinjen og i build-stempelet i appen.
  Maven-avhengigheter hentes til brukerens ~\.m2 som vanlig. Testene kjøres ikke
  her; de hører til EvidaNy2.0.
#>
param(
    [string]$Ref = 'HEAD',
    [string]$Config = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg = Read-Config $Config
$repo = Resolve-RootPath $cfg.paths.evidaNy2
$sub = 'backend/saksrom-api'
$out = Join-Path $Root '.build\saksrom-api'
$src = Join-Path $out 'kilde'
$tarFile = Join-Path $out 'kilde.tar'
$jar = Resolve-RootPath $cfg.paths.saksromJar

function Invoke-Git([string[]]$gitArgs) {
    $ErrorActionPreference = 'Continue'
    # --no-optional-locks: git skal ikke oppdatere indeksen i EvidaNy2.0.
    $o = & git -C $repo --no-optional-locks @gitArgs 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "git $($gitArgs -join ' ') feilet: $o" }
    return $o
}

$commit = "$(Invoke-Git @('rev-parse', '--verify', "$Ref^{commit}"))".Trim()
$subject = "$(Invoke-Git @('log', '-1', '--format=%ci %s', $commit))".Trim()
$uncommitted = @(Invoke-Git @('status', '--porcelain', '--', $sub) | Where-Object { $_ })
Write-Host "Bygger saksrom-api fra $commit ($subject)"
if ($uncommitted.Count) { Write-Host "  $($uncommitted.Count) ukommitterte endringer i $sub tas ikke med." -ForegroundColor Yellow }

if (Test-Path $src) { Remove-Item $src -Recurse -Force }
New-Item -ItemType Directory -Force $src | Out-Null
Invoke-Git @('archive', '--format=tar', "--output=$tarFile", $commit, $sub) | Out-Null
& tar.exe -xf $tarFile -C $src
if ($LASTEXITCODE -ne 0) { throw "Utpakking av $tarFile feilet." }
Remove-Item $tarFile -Force
$apiDir = Join-Path $src ($sub -replace '/', '\')

# Full sti til mvnw.cmd: cmd leter ikke alltid i arbeidsmappen (NoDefaultCurrentDirectoryInExePath).
# Arbeidsmappen må likevel være prosjektmappen, og Push-Location endrer ikke den for barneprosesser.
$mvn = Start-Process cmd.exe -ArgumentList '/c', "`"`"$apiDir\mvnw.cmd`" -B -q package -Dmaven.test.skip=true`"" -WorkingDirectory $apiDir -NoNewWindow -Wait -PassThru
if ($mvn.ExitCode -ne 0) { throw "Maven-bygget feilet (kode $($mvn.ExitCode))." }

$built = Get-ChildItem (Join-Path $apiDir 'target') -Filter '*.jar' | Where-Object { $_.Name -notlike '*.original' } | Select-Object -First 1
if (-not $built) { throw 'Fant ingen jar etter bygget.' }
New-Item -ItemType Directory -Force (Split-Path $jar -Parent) | Out-Null
Copy-Item $built.FullName $jar -Force
$sha = (Get-FileHash $jar -Algorithm SHA256).Hash.ToLower()
$info = [ordered]@{
    repo = $repo; path = $sub; ref = $Ref; commit = $commit; commitInfo = $subject
    jar = $jar; jarSha256 = $sha; builtAt = (Get-Date).ToString('o')
}
[IO.File]::WriteAllText((Get-SaksromInfoPath $jar), (ConvertTo-Json $info), (New-Object Text.UTF8Encoding $false))
Write-Host "Bygget $jar" -ForegroundColor Green
Write-Host "  commit $commit · sha256 $($sha.Substring(0, 16))…"
