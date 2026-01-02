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
$sql = "UPDATE users SET password_hash='$hash', password_salt='$salt', email_verified=1, is_super_user=1, updated_at=strftime('%s','now')*1000 WHERE email='$Email';"

if ($Remote) {
  npx wrangler d1 execute $Database --remote --command $sql
} else {
  npx wrangler d1 execute $Database --command $sql
}

Write-Host "✅ Uppdaterade $Email i $Database."
