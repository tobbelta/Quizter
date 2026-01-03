param(
  [string]$StatePath = ".wrangler/state/v3/d1"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $StatePath)) {
  Write-Host "Ingen lokal D1-state hittades på $StatePath."
  exit 0
}

Write-Host "Tar bort lokal D1-state: $StatePath"
Remove-Item -Recurse -Force $StatePath
Write-Host "✅ Klar. Starta om dev-servern och kör update-admin-password.ps1 igen."
