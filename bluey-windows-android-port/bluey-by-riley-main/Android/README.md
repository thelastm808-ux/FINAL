# Bluey for Android

Native Kotlin + Jetpack Compose companion app. It pairs with the Windows desktop host over the local network, streams microphone PCM to OpenAI Realtime using a short-lived token minted by Windows, forwards tool calls back to Windows, and uploads meeting audio chunks for transcription.

## Build on Windows 11

1. Install Android Studio and open **SDK Manager**. Install Android SDK Platform 36 and an Android SDK Build-Tools 36.x package. Android Studio supplies a suitable JDK.
2. From the repository root, run `./scripts/build-android.ps1` in PowerShell. The script downloads Gradle 8.13 from the official Gradle distribution site, verifies the distribution's SHA-256 checksum, and builds the debug APK.
3. APK output: `Android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r Android/app/build/outputs/apk/debug/app-debug.apk` or copy the APK to your phone and install it there.

Keep Windows and Android on the same trusted private Wi-Fi network. The Windows app displays a six-digit pairing code; enter that code in Android and tap Connect. Grant microphone permission, wake Bluey, and press-and-hold the berry to ask a question. Double-tap to sleep/wake. A persistent notification appears while the microphone session is active.

The Android code is source-only in this ZIP. It hasn't been compiled here because this build environment lacks Android SDK/Gradle. See the port guide for exact current limitations and safety notes.
