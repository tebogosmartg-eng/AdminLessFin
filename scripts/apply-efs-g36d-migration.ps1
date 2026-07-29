# Apply G3.6D efs_reporting_periods.financial_year_id migration via Supabase Management API.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'supabase/migrations/20260726220000_efs_g36d_financial_year_consumer_binding.sql'
$sql = Get-Content $migration -Raw

Add-Type -AssemblyName System.Security
$vault = New-Object Windows.Security.Credentials.PasswordVault
$cred = $vault.Retrieve('Supabase CLI', 'supabase')
$cred.RetrievePassword()
$token = $cred.Password

$ref = 'zaulhnpohrgqqodvzhxp'
$uri = "https://api.supabase.com/v1/projects/$ref/database/query"
$body = @{ query = $sql } | ConvertTo-Json

$response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
} -Body $body

Write-Output ($response | ConvertTo-Json -Depth 5)

# Verify column exists
$verifySql = @"
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'efs_reporting_periods'
  AND column_name = 'financial_year_id';
"@
$verifyBody = @{ query = $verifySql } | ConvertTo-Json
$verify = Invoke-RestMethod -Method Post -Uri $uri -Headers @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
} -Body $verifyBody
Write-Output 'VERIFY:'
Write-Output ($verify | ConvertTo-Json -Depth 5)
