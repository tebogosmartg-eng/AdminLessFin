Add-Type -AssemblyName System.Security
$vault = New-Object Windows.Security.Credentials.PasswordVault
$cred = $vault.Retrieve('Supabase CLI', 'supabase')
$cred.RetrievePassword()
Write-Output $cred.Password
