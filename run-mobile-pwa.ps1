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

function Get-LanIPv4Addresses {
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254.*"
      } |
      Select-Object -ExpandProperty IPAddress -Unique

    return @($ips)
  }
  catch {
    $fallback = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object {
        $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
        $_.IPAddressToString -notlike "127.*"
      } |
      ForEach-Object { $_.IPAddressToString } |
      Select-Object -Unique

    return @($fallback)
  }
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

  $lanIPs = Get-LanIPv4Addresses
  Write-Host ""
  Write-Host "Open one of these URLs on your phone (same Wi-Fi):" -ForegroundColor Green
  if ($lanIPs.Count -eq 0) {
    Write-Host "http://127.0.0.1:4173" -ForegroundColor Yellow
  }
  else {
    foreach ($ip in $lanIPs) {
      Write-Host "http://$ip:4173" -ForegroundColor Yellow
    }
  }

  Write-Host ""
  Write-Host "Press Ctrl+C to stop the preview server."

  Invoke-Step -Name "Starting LAN preview server" -Action {
    Invoke-CheckedCommand -Command "npm" -Arguments @("run", "mobile:pwa:preview")
  }
}
finally {
  Pop-Location
}
