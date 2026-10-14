$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repoRoot 'Android'
$gradleVersion = '8.13'

# Android Gradle Plugin 8.13.x requires Gradle 8.13 and JDK 17; use the official distribution and verify its hash.
$sdk = $env:ANDROID_SDK_ROOT
if ([string]::IsNullOrWhiteSpace($sdk)) { $sdk = $env:ANDROID_HOME }
if ([string]::IsNullOrWhiteSpace($sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path (Join-Path $sdk 'platforms\android-36\android.jar'))) {
    throw "Android SDK Platform 36 was not found under '$sdk'. Open Android Studio > SDK Manager and install Android SDK Platform 36 and Build-Tools."
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

# Prefer Android Studio's bundled JDK when it exists, because it is managed alongside Android Studio.
$jbrCandidates = @(
    (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr'),
    $env:JAVA_HOME
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$selectedJdk = $jbrCandidates | Where-Object { Test-Path (Join-Path $_ 'bin\java.exe') } | Select-Object -First 1
if ($selectedJdk) {
    $env:JAVA_HOME = $selectedJdk
    $env:PATH = (Join-Path $selectedJdk 'bin') + ';' + $env:PATH
} elseif (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw 'JDK 17 or newer is required. Install Android Studio (which includes a JDK) or set JAVA_HOME.'
}
$javaVersionOutput = (& java -version 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Java failed to start. Output: $javaVersionOutput" }
if ($javaVersionOutput -match '(?:version \"|openjdk )(\d+)') {
    $javaMajor = [int]$Matches[1]
} else {
    throw "Could not determine the installed Java version. Output: $javaVersionOutput"
}
if ($javaMajor -lt 17) { throw "JDK 17 or newer is required. Detected Java $javaMajor. Install/select Android Studio's bundled JDK." }

$cacheRoot = Join-Path $env:USERPROFILE '.gradle\bluey-build-tools'
$distribution = Join-Path $cacheRoot "gradle-$gradleVersion"
$gradle = Join-Path $distribution 'bin\gradle.bat'
if (-not (Test-Path $gradle)) {
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    $zip = Join-Path $cacheRoot "gradle-$gradleVersion-bin.zip"
    $shaUrl = "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip.sha256"
    $zipUrl = "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip"
    Write-Host "Downloading official Gradle $gradleVersion distribution..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $zip
    $expected = ((Invoke-WebRequest -Uri $shaUrl).Content.Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
        throw 'The downloaded Gradle archive failed SHA-256 verification. The archive was discarded.'
    }
    $extract = Join-Path $cacheRoot 'extract-tmp'
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    Remove-Item $distribution -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item (Join-Path $extract "gradle-$gradleVersion") $distribution
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Building Android debug APK...' -ForegroundColor Cyan
& $gradle -p $androidRoot --no-daemon assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'Android build failed. Read the Gradle errors above.' }
$apk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw 'Gradle reported success, but the expected APK was not created.' }
Write-Host "Build complete: $apk" -ForegroundColor Green
