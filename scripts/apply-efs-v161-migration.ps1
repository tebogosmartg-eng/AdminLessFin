# Apply V16.1 efs_company_master_data migration via Supabase Management API.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'supabase/migrations/20260721120000_efs_v161_company_master_data.sql'
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
