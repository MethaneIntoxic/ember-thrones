[CmdletBinding()]
param(
  [switch]$SkipInstall
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

  Write-Host ""
  Write-Host "Desktop preview will be available at http://127.0.0.1:4173" -ForegroundColor Green
  Write-Host "Press Ctrl+C to stop the preview server."

  Invoke-Step -Name "Starting local preview server" -Action {
    Invoke-CheckedCommand -Command "npm" -Arguments @("run", "mobile:pwa:preview")
  }
}
finally {
  Pop-Location
}
