param(
  [string]$Email = 'admin@admin.se',
  [string]$Password = 'admin',
  [string]$Database = 'quizter-db',
  [switch]$Remote
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'node saknas i PATH.'
  exit 1
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Error 'npx saknas i PATH.'
  exit 1
}

$remoteFlag = ''
if ($Remote.IsPresent) {
  $remoteFlag = '--remote'
}

function Invoke-D1Command {
  param(
    [string]$Sql,
    [switch]$Json
  )
  if ($Json) {
    $result = & npx wrangler d1 execute $Database $remoteFlag --json --command $Sql
  } else {
    & npx wrangler d1 execute $Database $remoteFlag --command $Sql | Out-Host
    $result = $null
  }
  if ($LASTEXITCODE -ne 0) {
    throw "D1-kommandot misslyckades (exit $LASTEXITCODE)."
  }
  return $result
}

$env:QUIZTER_PASSWORD_TEMP = $Password
$creds = node -e "import('./functions/lib/passwords.js').then(({ hashPassword }) => hashPassword(process.env.QUIZTER_PASSWORD_TEMP)).then(({ hash, salt }) => console.log(hash + '|' + salt)).catch((err) => { console.error(err); process.exit(1); });"
Remove-Item Env:QUIZTER_PASSWORD_TEMP -ErrorAction SilentlyContinue

if (-not $creds) {
  Write-Error 'Kunde inte generera hash/salt.'
  exit 1
}

$parts = $creds.Trim() -split '\|'
if ($parts.Count -lt 2) {
  Write-Error "Ogiltigt hash-format: $creds"
  exit 1
}

$hash = $parts[0]
$salt = $parts[1]

$userId = [guid]::NewGuid().ToString()

Invoke-D1Command "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, display_name TEXT, created_at INTEGER NOT NULL, is_super_user BOOLEAN DEFAULT FALSE);"
Invoke-D1Command "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);"

$columnInfoRaw = Invoke-D1Command "PRAGMA table_info(users);" -Json
$columnInfo = $columnInfoRaw | ConvertFrom-Json
$columns = @()
if ($columnInfo.Count -gt 0 -and $columnInfo[0].results) {
  $columns = $columnInfo[0].results | ForEach-Object { $_.name }
}

$requiredColumns = @{
  'email' = 'email TEXT'
  'display_name' = 'display_name TEXT'
  'created_at' = 'created_at INTEGER'
  'is_super_user' = 'is_super_user BOOLEAN DEFAULT FALSE'
  'password_hash' = 'password_hash TEXT'
  'password_salt' = 'password_salt TEXT'
  'email_verified' = 'email_verified BOOLEAN DEFAULT FALSE'
  'verification_token' = 'verification_token TEXT'
  'verification_expires' = 'verification_expires INTEGER'
  'updated_at' = 'updated_at INTEGER'
}

foreach ($entry in $requiredColumns.GetEnumerator()) {
  if (-not ($columns -contains $entry.Key)) {
    Invoke-D1Command "ALTER TABLE users ADD COLUMN $($entry.Value);"
  }
}

$sql = "INSERT INTO users (id,email,display_name,created_at,is_super_user,email_verified,password_hash,password_salt,updated_at) VALUES ('$userId','$Email','Admin',strftime('%s','now')*1000,1,1,'$hash','$salt',strftime('%s','now')*1000) ON CONFLICT(email) DO UPDATE SET password_hash='$hash', password_salt='$salt', email_verified=1, is_super_user=1, updated_at=strftime('%s','now')*1000;"
Invoke-D1Command $sql

Write-Host "✅ Skapade/uppdaterade $Email i $Database."

$verifyResult = Invoke-D1Command "SELECT email,email_verified, password_hash IS NOT NULL AS has_password, is_super_user FROM users WHERE email='$Email';" -Json
if ($verifyResult.Count -gt 0 -and $verifyResult[0].results -and $verifyResult[0].results.Count -gt 0) {
  Write-Host "Verifiering:"
  $verifyResult[0].results | ConvertTo-Json -Depth 4 | Write-Host
} else {
  Write-Host "Kunde inte hitta $Email direkt efter uppdatering."
}
