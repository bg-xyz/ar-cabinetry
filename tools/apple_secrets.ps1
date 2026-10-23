# One-time: give the iOS workflow the same Apple signing secrets Ragtime uses (same Apple account,
# same "GitHub Actions" App Store Connect API key), so it can sign and upload to TestFlight.
# Run AFTER the App Store Connect app record for xyz.bg.cabinets exists, or the first upload fails.
# Key ids live outside the repo in %USERPROFILE%\.config\ragtime\asc.json: { "issuer": "...", "keyId": "..." }
$ErrorActionPreference = 'Stop'
$dir    = Join-Path $env:USERPROFILE '.config\ragtime'
$cfg    = Get-Content -Raw (Join-Path $dir 'asc.json') | ConvertFrom-Json
$issuer = $cfg.issuer
$keyId  = $cfg.keyId
$repo   = 'bg-xyz/ar-cabinetry'

gh secret set APP_STORE_CONNECT_ISSUER_ID      --repo $repo --body $issuer
gh secret set APP_STORE_CONNECT_KEY_IDENTIFIER --repo $repo --body $keyId
Get-Content -Raw (Join-Path $dir "AuthKey_$keyId.p8") | gh secret set APP_STORE_CONNECT_PRIVATE_KEY --repo $repo
Get-Content -Raw (Join-Path $dir 'codemagic_cert_key') | gh secret set CERTIFICATE_PRIVATE_KEY --repo $repo
gh secret list --repo $repo
