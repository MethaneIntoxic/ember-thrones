[CmdletBinding()]
param(
  [string]$Ref,
  [switch]$SkipInstall,
  [switch]$SkipDispatch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("Command failed with exit code {0}: {1} {2}" -f $LASTEXITCODE, $Command, ($Arguments -join " "))
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
}

Push-Location $PSScriptRoot
try {
  if (-not $SkipInstall) {
    Invoke-Step -Name "Installing dependencies" -Action {
      Invoke-CheckedCommand -Command "npm" -Arguments @("install")
    }
  }

  Invoke-Step -Name "Building mobile PWA bundle" -Action {
    Invoke-CheckedCommand -Command "npm" -Arguments @("run", "mobile:pwa:build")
  }

  if ($SkipDispatch) {
    Write-Host ""
    Write-Host "Build completed. Workflow dispatch skipped because -SkipDispatch was provided." -ForegroundColor Yellow
    return
  }

  $gh = Get-Command "gh" -ErrorAction SilentlyContinue
  if (-not $gh) {
    throw "GitHub CLI (gh) was not found. Install gh or rerun with -SkipDispatch."
  }

  & gh auth status 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' or rerun with -SkipDispatch."
  }

  if ([string]::IsNullOrWhiteSpace($Ref)) {
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($branch)) {
      $Ref = $branch
    }
  }

  $dispatchArgs = @("workflow", "run", "deploy.yml")
  if (-not [string]::IsNullOrWhiteSpace($Ref)) {
    $dispatchArgs += @("--ref", $Ref)
  }

  Invoke-Step -Name "Dispatching GitHub Pages workflow" -Action {
    Invoke-CheckedCommand -Command "gh" -Arguments $dispatchArgs
  }

  Write-Host ""
  Write-Host "Deployment workflow queued. Check the Actions tab in GitHub for progress." -ForegroundColor Green
}
finally {
  Pop-Location
}
