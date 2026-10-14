$names = @('Bluey Windows host TCP 42424', 'Bluey Android discovery UDP 42425')
foreach ($name in $names) { Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule }
Write-Host 'Removed Bluey firewall rules.'
