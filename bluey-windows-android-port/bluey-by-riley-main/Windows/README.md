# Bluey for Windows 11

This is the native Windows desktop host port. It is a WPF application targeting .NET 10 and Windows 10.0.19041+ (including Windows 11). The source project does not include a compiled Windows binary.

From the repository root in PowerShell:

```powershell
./scripts/build-windows.ps1
```

The script publishes a self-contained x64 app into `dist/BlueyWindows/`. Install the **.NET 10 SDK** first. Run `Bluey.exe` from the output folder.

The application stores the main OpenAI key in the current Windows user's Credential Manager. It uses Windows UI Automation and a primary-display screenshot to understand the foreground app, Win32 input APIs for computer actions, and a TCP/UDP bridge to the Android client.

For phone pairing and firewall setup, see [`../WINDOWS-ANDROID-PORT.md`](../WINDOWS-ANDROID-PORT.md).
