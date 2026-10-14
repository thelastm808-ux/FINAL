# Bluey: Windows 11 + Android port

This package keeps the original Swift/macOS/iOS files and adds two new platform implementations:

- `Windows/` — a native WPF desktop host in C# using Windows APIs.
- `Android/` — a native Kotlin/Jetpack Compose phone app.
- `scripts/build-windows.ps1` — builds a self-contained Windows x64 publish folder.
- `scripts/build-android.ps1` — verifies and downloads Gradle 8.13 when needed, then builds the Android debug APK.
- `scripts/enable-windows-firewall.ps1` — adds narrowly scoped Private-profile firewall rules.

## What the port implements

The Windows side stores the real OpenAI API key in Windows Credential Manager, creates short-lived Realtime client secrets, captures the primary desktop screen, reads accessible controls via Windows UI Automation, draws a click-through blueberry overlay near the cursor, runs pointing/click/type/shortcut/scroll/drag/open-app/open-URL actions, handles web research through the Responses API, and saves meeting notes plus audio chunks under `Documents\Bluey Notes`.

The Android side has the blueberry UI, LAN host discovery/manual IPv4 entry, six-digit pairing, microphone permission handling, a foreground microphone service with a persistent notification, Realtime WebSocket streaming, press-and-hold asking, tool-call forwarding, captions, and five-minute WAV chunks for diarized transcription.

The newline-delimited JSON packet fields (`command`, `callID`, `tool`, `text`, `image`, `face`, etc.) follow the shapes in `Shared/GooglyLink.swift`, so the conceptual command flow remains the same. The Windows/Android pair uses its own UDP discovery message (`BLUEY_DISCOVER`) because Windows doesn't automatically advertise the original Apple Bonjour service.

## Build and first run

### Windows 11 host

Install the **.NET 10 SDK for Windows**. From the repository root, open PowerShell and run:

```powershell
./scripts/build-windows.ps1
```

Launch `dist/BlueyWindows/Bluey.exe`. Add your OpenAI API key in the app's password field and choose **Save key**. The key is stored in the current Windows user's Credential Manager; it isn't saved in this repository.

If Windows Firewall blocks the phone, run PowerShell as Administrator and execute:

```powershell
./scripts/enable-windows-firewall.ps1
```

This allows TCP 42424 and UDP 42425 on the **Private** firewall profile only. To remove the rules, run `scripts/disable-windows-firewall.ps1` as Administrator.

### Android phone

Install Android Studio, then use SDK Manager to install Android SDK Platform 36 and Android SDK Build-Tools 36.x. From the repository root:

```powershell
./scripts/build-android.ps1
```

The resulting APK is `Android/app/build/outputs/apk/debug/app-debug.apk`. Install with `adb install -r Android/app/build/outputs/apk/debug/app-debug.apk`, or transfer it to the device. The build script expects a JDK 17+; Android Studio includes one. It downloads Gradle 8.13 only if the cached Gradle distribution is missing, and verifies its official SHA-256 checksum before extracting it.

### Connect

1. Run Bluey on Windows and leave it open. Note the displayed host IPv4 address and the six-digit pairing code.
2. Put the Android phone on the same trusted private Wi-Fi. Open Bluey, tap **Find PC** or enter the Windows IPv4 address, enter the Windows pairing code, then tap **Connect**.
3. Grant microphone access. Wake Bluey and press-and-hold the blueberry to ask; release to submit the question. Double-tap to sleep/wake.
4. Turn on **Let Bluey use this computer** in the Windows host only when you want desktop actions. It's off by default. Use **Stop computer actions** to pause them immediately.

The main OpenAI key stays on Windows. Android receives a short-lived Realtime token from the paired Windows host. Internet access and an OpenAI API account/key are required; this is not an offline implementation, and OpenAI usage may incur charges.

## Important differences from the original Apple versions

- The source has been reimplemented in C# and Kotlin rather than mechanically translated from SwiftUI/AppKit. Mac and iOS source projects are retained as-is.
- Windows screen reading uses the **primary display** screenshot and Windows UI Automation. Accessibility information varies between apps; the `W#` per-word target boxes are approximate. Elevated/protected windows may expose little text, and this version doesn't use Apple's Vision OCR / ScreenCaptureKit.
- Android records WAV/PCM chunks instead of the original iOS AAC chunks, so chunks are larger on the local network. The live assistant produces text, not spoken TTS, consistent with the existing text-only Realtime session.
- The Android foreground service keeps the microphone session alive when the app is backgrounded and shows an ongoing notification. Android can still stop the process under force-stop, severe memory pressure, or OEM battery management; if the session stops, reopen Bluey and wake it again.
- Apple-specific menu-bar shortcuts, macOS settings, original iOS speaker controls, and the original Apple screen/cursor behavior have not been duplicated 1:1. The new host has its own Windows settings window and click-through cursor overlay.
- Web research and meeting transcription require the OpenAI API key and internet access. Meeting audio/transcripts are sent to OpenAI for transcription, then stored locally in `Documents\Bluey Notes`.

## Network and computer-control safety

The Windows host accepts clients only after the six-digit pairing code is validated; five failed code attempts within five minutes temporarily block pairing for two minutes. Unauthenticated sockets do not receive face broadcasts or API tokens. This is still a local-network pairing gate, not encrypted transport. Use a trusted private Wi-Fi network; don't expose ports 42424/42425 to the internet or allow them on the Public firewall profile. The computer-control toggle starts off. Typing is blocked when Windows UI Automation identifies the focused control as a password field, and common lock/force-close shortcuts are blocked; custom apps may not expose every password field reliably. Enabled desktop automation can still affect files or apps. Keep unsaved work safe and supervise consequential actions.

## Validation status

I inspected the original project structure and the new source, fixed issues found during static review, and added reproducible build scripts and setup documentation. **I could not compile or run the Windows or Android builds in this workspace** because it has no .NET SDK, Android SDK, Gradle installation, or attached Android device. Treat this as a prepared source port that still needs the included build scripts run on a Windows 11 development machine, followed by real device testing—not as a verified, signed installer/APK.

Recommended smoke test after building: pair Android, wake/sleep twice, hold/release a short question, look at the screen, point at an accessible control, click/type with computer control enabled, verify password field typing is blocked, verify stop/resume, record for over five minutes, confirm transcription and `notes.md`/`session.json`/WAV files appear, then background Android and confirm the listening notification remains. Test on a private LAN only.
