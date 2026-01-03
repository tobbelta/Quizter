param(
  [string]$Email = 'admin@admin.se',
  [string]$Password = 'admin',
  [int]$Port = 8788
)

$ErrorActionPreference = 'Stop'

$url = "http://127.0.0.1:$Port/api/dev/seedAdmin"
$body = @{ email = $Email; password = $Password } | ConvertTo-Json

try {
  $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30
  $resp | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  $ex = $_.Exception
  Write-Host "Seed misslyckades."
  if ($ex.Response) {
    $status = $ex.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    $reader.Close()
    Write-Host "Status: $status"
    Write-Host "Body: $responseBody"
  } else {
    Write-Host $_
  }
}
