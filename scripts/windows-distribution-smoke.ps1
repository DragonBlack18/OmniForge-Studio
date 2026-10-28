# OmniForge Windows package gate — intended ONLY for ephemeral GitHub-hosted Windows runners.
# Tests the *real* portable and installed executables. Never deletes a user's project/data.
[CmdletBinding()]
param([string]$ReleaseDirectory = 'release')
$ErrorActionPreference = 'Stop'
if (!$env:GITHUB_ACTIONS -or !$env:RUNNER_TEMP) {
  throw 'Este teste modifica o perfil do runner. Execute somente no GitHub Actions (Windows ephemeral).'
}
$version = & node -p "require('./package.json').version"
$setup = Join-Path $ReleaseDirectory "OmniForge-Studio-Setup-$version-x64.exe"
$portable = Join-Path $ReleaseDirectory "OmniForge-Studio-Portable-$version-x64.exe"
foreach ($file in @($setup,$portable)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Binário ausente: $file" }
  if ((Get-Item -LiteralPath $file).Length -lt 1000000) { throw "Binário incompleto: $file" }
}
function Test-WindowCloses([string]$exe, [string]$kind) {
  $before = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'OmniForge Studio' } | Select-Object -ExpandProperty Id)
  $process = Start-Process -FilePath $exe -PassThru
  $window = $null
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  try {
    do {
      Start-Sleep -Milliseconds 600
      $window = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'OmniForge Studio' -and $before -notcontains $_.Id } | Select-Object -First 1
    } while (!$window -and [DateTime]::UtcNow -lt $deadline)
    if (!$window) { throw "$kind não abriu uma janela principal no runner Windows." }
    $window.Refresh()
    if (!$window.CloseMainWindow()) { throw "$kind recusou solicitação de fechar pelo X." }
    if (!$window.WaitForExit(15000)) { throw "$kind ficou aberto depois de solicitar o fechamento." }
    Write-Host "PASS $kind: abriu janela e fechou pelo X sem processo órfão."
  } finally {
    # No Stop-Process or taskkill: failures are retained for diagnostics on the ephemeral runner.
  }
}
Test-WindowCloses (Resolve-Path -LiteralPath $portable).Path 'Portable'

# Install and uninstall using NSIS silently only on an ephemeral GitHub runner.
# Refuse to touch an already-existing install: never uninstall an unrelated copy.
$installBase = Join-Path $env:LOCALAPPDATA 'Programs'
$existing = @(Get-ChildItem -LiteralPath $installBase -Filter '*omniforge*' -Directory -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'Instalação pré-existente detectada. Gate interrompido para não alterar dados existentes.' }
$installProcess = Start-Process -FilePath (Resolve-Path -LiteralPath $setup).Path -ArgumentList '/S' -PassThru -Wait
if ($installProcess.ExitCode -ne 0) { throw "Instalador NSIS falhou: $($installProcess.ExitCode)" }
$installed = @(Get-ChildItem -LiteralPath $installBase -Recurse -Filter 'OmniForge Studio.exe' -File -ErrorAction SilentlyContinue)
if ($installed.Count -ne 1) { throw "Instalação inesperada: $($installed.Count) executáveis encontrados." }
Test-WindowCloses $installed[0].FullName 'Setup instalado'
$uninstaller = @(Get-ChildItem -LiteralPath $installed[0].Directory.FullName -Filter '*Uninstall*.exe' -File -ErrorAction SilentlyContinue)
if ($uninstaller.Count -ne 1) { throw 'Desinstalador não encontrado; não executar limpeza manual.' }
$uninstallProcess = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstallProcess.ExitCode -ne 0) { throw "Desinstalação falhou: $($uninstallProcess.ExitCode)" }
if (Test-Path -LiteralPath $installed[0].FullName) { throw 'Desinstalação deixou o executável instalado.' }
Write-Host 'PASS Setup NSIS: instalou, abriu, fechou e desinstalou sem apagar dados do workspace.'
