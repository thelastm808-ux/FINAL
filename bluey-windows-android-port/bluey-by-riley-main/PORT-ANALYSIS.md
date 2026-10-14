# Bluey source review and Windows 11 / Android port notes

## What was in the supplied archive

The starting project was an Apple-platform codebase: a macOS menu-bar host, an iPhone app, shared Swift protocol/theme code, fonts, and cursor/character preview assets. The Apple implementation contains about **5,947 lines of Swift** across `Mac/`, `iOS/`, and `Shared/`. It has no Windows or Android project and no cross-platform UI framework, so a Windows/Android conversion requires native implementations rather than just changing a project target.

## Original source inventory

- `Mac/Sources/GooglyMac/AppDelegate.swift`, `main.swift`, `Settings.swift`, `HotKeys.swift`: menu-bar app lifecycle, settings, and macOS keyboard shortcuts.
- `Mac/Sources/GooglyMac/RealtimeHost.swift`, `PhoneServer.swift`: OpenAI Realtime token/session configuration and the Mac-to-phone newline-JSON TCP/Bonjour link.
- `Mac/Sources/GooglyMac/ScreenReader.swift`, `ControlsReader.swift`, `ComputerControl.swift`, `CursorOverlay.swift`: macOS screen/UI inspection, mouse and keyboard control, and the floating cursor overlay.
- `Mac/Sources/GooglyMac/MeetingNotes.swift`, `WebResearch.swift`, `ReportPanel.swift`, `Keychain.swift`, `Fonts.swift`: transcription and session files, web research, report display, API-key storage, and UI fonts.
- `iOS/Sources/BlueyAppView.swift`, `FaceView.swift`, `BlobShape.swift`, `PairingView.swift`, `SoundButton.swift`: app UI, character drawing, pairing, and phone controls.
- `iOS/Sources/LiveVoice.swift`, `ChunkRecorder.swift`, `MacLink.swift`, `SessionStore.swift`, `GooglyApp.swift`: Realtime audio streaming, meeting audio chunks, host protocol, local session state, and app lifecycle.
- `Shared/GooglyLink.swift`, `Palette.swift`, and `Fonts/`: shared packet shapes, theme constants, and font files/licenses.
- `Package.swift`, `project.yml`, `GooglyEyes.xcodeproj/`, `README.md`, and `scripts/build-mac.sh`: Apple builds, project generation, documentation, and license.

The original source and its project metadata remain in the archive. The Windows and Android implementations are separate native projects, since AppKit/SwiftUI, ScreenCaptureKit, Vision, macOS Accessibility, Keychain, Network/Bonjour, and iOS audio/lifecycle APIs have no direct Windows/Android equivalent.

## What was added

### Windows (`Windows/`)

- `Bluey.Windows.csproj`, `App.xaml`, `MainWindow.xaml`, `BlueyOverlay.xaml`: native WPF desktop app and floating character/caption overlay.
- `PhoneServer.cs`, `Protocol.cs`: TCP newline-JSON pairing/commands, UDP host discovery, packet types, and six-digit pairing authentication.
- `CredentialStore.cs`: stores the main OpenAI key in the current Windows user's Credential Manager instead of writing it to the repository.
- `BlueyAgent.cs`: creates short-lived OpenAI Realtime credentials, defines assistant tools, forwards tool calls, and provides Responses API web research.
- `ScreenReader.cs`: primary-display JPEG capture plus Windows UI Automation text/control extraction. Coordinates/word boxes are approximate for text-only accessibility elements.
- `ComputerControl.cs`: Win32 mouse and keyboard input, app/URL launching, best-effort password-field protection through UI Automation, and blocks common lock/force-close shortcuts.
- `MeetingNotesService.cs`: writes WAV chunks, diarized/fallback transcripts, `notes.md`, and `session.json` to Documents.
- `scripts/build-windows.ps1`: publishes a self-contained Windows x64 output folder.

### Android (`Android/`)

- `MainActivity.kt`: Jetpack Compose app, blueberry UI, pairing inputs, hold-to-ask and double-tap wake/sleep gestures.
- `BlueyLink.kt`: UDP discovery, manual IP, TCP JSON packets, and PIN handshake.
- `VoiceController.kt`: microphone PCM capture and resampling, Realtime WebSocket events, tool forwarding, and five-minute WAV chunks.
- `BlueyForegroundService.kt`, `BlueyRuntime.kt`: visible microphone foreground notification and a process-level session owner to reduce unnecessary teardown when the Activity is recreated/backgrounded.
- Gradle Kotlin DSL configuration, manifest, font resources, and `scripts/build-android.ps1` for the debug APK.

### Shared protocol and security choices

The new pair retains the original protocol's important packet fields (`command`, `callID`, `tool`, `text`, `image`, `face`, and `hello`). Android first pairs to Windows with a six-digit code displayed in the desktop window; repeated failed codes trigger a temporary pairing lockout. Before pairing, the Windows listener does not forward assistant messages/faces or reveal a Realtime token. The primary OpenAI key remains on Windows; the phone receives a short-lived token. Desktop automation starts disabled and is separately gated in the Windows UI.

## Compatibility differences and limits

- Windows uses UI Automation and a primary-display screenshot instead of macOS ScreenCaptureKit + Vision OCR. It can miss protected/elevated UI or apps that expose little accessibility text.
- Android uses 24 kHz mono PCM WAV chunks instead of iOS AAC chunks. The live interaction is text output, matching the original text-only Realtime configuration.
- Windows cursor behavior and settings are a new WPF implementation, not a pixel-identical port of the macOS menu-bar app. Apple's menu bar, keyboard shortcuts, iOS sound controls, and Apple Bonjour behavior are not duplicated one-for-one.
- The network pairing is an authentication gate on the local LAN, not end-to-end encrypted transport. Use a trusted Private Wi-Fi network; do not port-forward these ports or open them to Public networks.
- OpenAI access and billing are required for live voice, web research, short-lived tokens, and meeting transcription. This is not an offline version.

## Validation performed here

- Enumerated the complete archive and reviewed platform architecture/protocol dependencies.
- Parsed the Windows XAML, app manifest, project file, and Android manifest/styles XML successfully.
- Checked referenced font assets and XAML event-handler names.
- Checked source brace balance and searched for common unfinished-code markers.
- Attempted an available Kotlin compiler pass; Android/Compose/OkHttp classes could not resolve because Android SDK and Gradle dependencies are not installed in this workspace, so that is not a successful build.

**Not verified:** native compilation, application startup, OpenAI API behavior on a live key, LAN pairing between physical devices, microphone lifecycle on a phone, screen capture/control, or real transcription output. This environment has no .NET SDK, Android SDK/`android.jar`, Gradle installation, or attached Windows/Android device. Run both included build scripts on Windows 11 and then perform the real-device smoke test in `WINDOWS-ANDROID-PORT.md` before relying on the port.
