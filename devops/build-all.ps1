#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds everything step by step: dependencies, physics (wasm), Project Browser, UI Designer, Desktop (Electron),
  the tools (src/CSEngine/Tools/*: the VSCodium extension is built and packed as a .vsix into src/CSEngine/Binaries/Tools).
.PARAMETER SkipInstall
  Do not run `pnpm install`.
.PARAMETER SkipPhysics
  Do not publish the physics wasm (the game then runs without a simulation).
.PARAMETER Web
  Also build the web game (Core) into src/CSEngine/Binaries/Core.
.EXAMPLE
  pwsh devops/build-all.ps1 -SkipPhysics
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipPhysics,
    [switch]$Web
)

$ErrorActionPreference = 'Stop'

$Root   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Engine = Join-Path $Root 'src/CSEngine'
$Editor = Join-Path $Engine 'Modules/Editor'
$script:StepNumber = 0
$script:Warnings = @()

function Step([string]$Title) {
    $script:StepNumber++
    Write-Host "`n[$script:StepNumber] $Title" -ForegroundColor Cyan
}

function Warn([string]$Message) {
    Write-Host "WARNING: $Message" -ForegroundColor Yellow
    $script:Warnings += $Message
}

# Runs a command in a folder and fails on a non-zero exit code (native commands do not throw on their own).
function Invoke-In([string]$Directory, [scriptblock]$Command) {
    Push-Location $Directory
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE in $Directory" }
    }
    finally { Pop-Location }
}

# --- 0. Prerequisites ---
Step 'Checking prerequisites'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed (need 22.12+).' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is not installed (need 10+).' }
$nodeVersion = [version]((node -v).Trim().TrimStart('v'))
if ($nodeVersion -lt [version]'22.12') { throw "Node $nodeVersion found, need 22.12 or newer." }
Write-Host "node $nodeVersion, pnpm $(pnpm -v)"

# --- 1. Dependencies ---
if ($SkipInstall) {
    Step 'Dependencies: skipped (-SkipInstall)'
}
else {
    Step 'Installing dependencies (pnpm workspace)'
    Invoke-In $Engine { pnpm install }
}

# --- 2. Physics ---
if ($SkipPhysics) {
    Step 'Physics: skipped (-SkipPhysics)'
}
else {
    Step 'Publishing physics (wasm)'
    $bridge = Join-Path $Engine 'Physics/Bridge/Bridge.csproj'
    $log    = Join-Path $PSScriptRoot 'publish.log'
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        Warn 'dotnet not found - physics skipped (the game runs without a simulation).'
    }
    elseif (-not (Test-Path $bridge)) {
        Warn "$bridge not found - physics skipped."
    }
    else {
        if (-not ((dotnet workload list 2>$null) -match 'wasm-tools')) {
            Warn 'Workload wasm-tools looks missing (dotnet workload install wasm-tools); trying anyway.'
        }
        dotnet publish $bridge -c Release -p:TrimmerSingleWarn=false -v:normal | Out-File -FilePath $log -Encoding utf8
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'Physics published. Log: devops/publish.log'
        }
        else {
            Get-Content $log -Tail 30
            Warn 'Physics publish failed - see devops/publish.log. Continuing without it.'
        }
    }
}

# --- 3. Project Browser ---
Step 'Building Project Browser'
Invoke-In (Join-Path $Editor 'ProjectBrowser') { pnpm build }

# --- 4. UI Designer ---
Step 'Building UI Designer'
Invoke-In (Join-Path $Editor 'UIDesigner') { pnpm build }

# --- 5. Desktop (Electron) ---
Step 'Building Desktop (Electron main process + preload)'
Invoke-In (Join-Path $Engine 'Programs/Desktop') { pnpm build }

# --- 6. Tools (plugins) ---
# Every folder of Tools with a package.json: one that packs itself (a "package" script) is built and packed into a
# .vsix, one with only a "build" script is built. Output goes to src/CSEngine/Binaries/Tools/<name>.
Step 'Building tools (Tools/*)'
foreach ($tool in Get-ChildItem (Join-Path $Engine 'Tools') -Directory) {
    $manifest = Join-Path $tool.FullName 'package.json'
    if (-not (Test-Path $manifest)) { continue }
    $scripts = (Get-Content $manifest -Raw | ConvertFrom-Json).scripts
    $out = Join-Path $Engine "Binaries/Tools/$($tool.Name)"
    if ($scripts.PSObject.Properties.Name -contains 'package') {
        Write-Host "$($tool.Name): build and package"
        try {
            Invoke-In $tool.FullName { pnpm run package }
        }
        catch {
            # The build comes first and leaves the unpacked extension; only the packing (it fetches @vscode/vsce with npm) can fail alone.
            if (-not (Test-Path (Join-Path $out 'package.json'))) { throw }
            Warn "$($tool.Name): built, but the .vsix was not packed (it needs the network for @vscode/vsce)."
        }
        Get-ChildItem $out -Filter *.vsix -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "$($tool.Name): $($_.FullName)" }
    }
    elseif ($scripts.PSObject.Properties.Name -contains 'build') {
        Write-Host "$($tool.Name): build"
        Invoke-In $tool.FullName { pnpm build }
    }
}

# --- 7. Optional: web game ---
if ($Web) {
    Step 'Building the web game (Core)'
    Invoke-In (Join-Path $Engine 'Core') { pnpm build }
}

Write-Host "`nDone. Start the Project Manager with: pwsh devops/start-desktop.ps1" -ForegroundColor Green
if ($script:Warnings.Count -gt 0) {
    Write-Host 'Warnings:' -ForegroundColor Yellow
    $script:Warnings | ForEach-Object { Write-Host "  - $_" }
}
