param(
  [string]$Email = 'admin@admin.se',
  [string]$Password = 'admin',
  [string]$Database = 'quizter-db',
  [int]$Port = 8788
)

$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host "=== $Title ==="
}

function Invoke-D1 {
  param([string]$Sql)
  $raw = & npx wrangler d1 execute $Database --json --command $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "D1-kommandot misslyckades (exit $LASTEXITCODE)."
  }
  return ($raw | ConvertFrom-Json)
}

Write-Section "Kontrollerar lokal användare"
$sql = "SELECT email,email_verified, password_hash IS NOT NULL AS has_password, is_super_user FROM users WHERE email='$Email';"
$result = Invoke-D1 $sql
if ($result.Count -gt 0 -and $result[0].results -and $result[0].results.Count -gt 0) {
  $result[0].results | ConvertTo-Json -Depth 4 | Write-Host
} else {
  Write-Host "Hittade ingen användare för $Email i lokal D1."
}

Write-Section "Testar login mot dev-server"
$url = "http://127.0.0.1:$Port/api/auth/login"
$body = @{ email = $Email; password = $Password } | ConvertTo-Json
try {
  $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 10
  $resp | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  $ex = $_.Exception
  Write-Host "Login misslyckades."
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
