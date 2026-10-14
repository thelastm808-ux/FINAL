$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'Windows\Bluey.Windows.csproj'
$output = Join-Path $root 'dist\BlueyWindows'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'Install the .NET 10 SDK for Windows, then reopen PowerShell. https://dotnet.microsoft.com/en-us/download/dotnet/10.0'
}
$version = (& dotnet --version).Trim()
if ([int]($version.Split('.')[0]) -lt 10) {
    throw "Bluey targets .NET 10. Detected SDK $version. Install the .NET 10 SDK and try again."
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
& dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $output
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed. Read the build errors above.' }
Write-Host "Build complete: $output\Bluey.exe" -ForegroundColor Green
