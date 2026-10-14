# Run from an elevated PowerShell window. Only opens Bluey's ports on Private networks.
$ErrorActionPreference = 'Stop'
$rules = @(
    @{ Name = 'Bluey Windows host TCP 42424'; Protocol = 'TCP'; Port = '42424' },
    @{ Name = 'Bluey Android discovery UDP 42425'; Protocol = 'UDP'; Port = '42425' }
)
foreach ($rule in $rules) {
    Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Port -Profile Private | Out-Null
}
Write-Host 'Bluey ports are allowed on Private networks only. Do not switch a public hotspot or public Wi-Fi to Private just for this.' -ForegroundColor Green
