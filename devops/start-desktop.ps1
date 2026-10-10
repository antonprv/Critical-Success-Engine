#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Quick start of the Electron desktop app: the Project Manager (and from there the UI Designer).
.PARAMETER Designer
  Open the UI Designer on its own (it asks which project to use).
.PARAMETER Build
  Build the app first (devops/build-all.ps1 -SkipPhysics).
.EXAMPLE
  pwsh devops/start-desktop.ps1
#>
[CmdletBinding()]
param(
    [switch]$Designer,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'

$Root     = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Engine   = Join-Path $Root 'src/CSEngine'
$Desktop  = Join-Path $Engine 'Programs/Desktop'
$Binaries = Join-Path $Engine 'Binaries'

if ($Build) {
    & (Join-Path $PSScriptRoot 'build-all.ps1') -SkipPhysics
}

# Dev-server URLs (CSE_PROJECT_BROWSER_URL / CSE_UI_DESIGNER_URL) replace the built pages, so only check without them.
$missing = @()
if (-not (Test-Path (Join-Path $Binaries 'Programs/Desktop/main.cjs')))    { $missing += 'Desktop (main.cjs)' }
if (-not (Test-Path (Join-Path $Binaries 'Programs/Desktop/preload.cjs'))) { $missing += 'Desktop (preload.cjs)' }
if (-not $env:CSE_PROJECT_BROWSER_URL -and -not (Test-Path (Join-Path $Binaries 'Modules/Editor/ProjectBrowser/index.html'))) { $missing += 'Project Browser' }
if (-not $env:CSE_UI_DESIGNER_URL -and -not (Test-Path (Join-Path $Binaries 'Modules/Editor/UIDesigner/index.html')))         { $missing += 'UI Designer' }
if ($missing.Count -gt 0) {
    Write-Host "Not built yet: $($missing -join ', ')" -ForegroundColor Red
    Write-Host 'Run: pwsh devops/build-all.ps1 -SkipPhysics   (or: pwsh devops/start-desktop.ps1 -Build)'
    exit 1
}

Push-Location $Desktop
try {
    if ($Designer) { pnpm exec electron . --ui-designer }
    else           { pnpm start }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally { Pop-Location }
