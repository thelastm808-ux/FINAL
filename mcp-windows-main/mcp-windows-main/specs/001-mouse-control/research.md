# Research: Mouse Control

**Feature**: 001-mouse-control  
**Date**: 2025-12-07  
**Status**: Complete

## Research Tasks

This document consolidates research findings for all technical decisions required by the mouse control feature.

---

## 1. SendInput API for Mouse Operations

**Decision**: Use `SendInput` Windows API for all mouse operations

**Rationale**: 
- `SendInput` is the modern, supported API for synthesizing input events (Constitution XV, FR-001)
- It guarantees that input events are not interspersed with other input (atomic sequences)
- Returns the number of successfully injected events for error detection
- Subject to UIPI - automatically fails when targeting elevated processes

**Alternatives Considered**:
- `mouse_event` - REJECTED: Deprecated API (FR-002 explicitly prohibits)
- `SetCursorPos` alone - REJECTED: Only moves cursor, doesn't generate click events

**Key Documentation**:
- [SendInput function](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
- [MOUSEINPUT structure](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput)
- [INPUT structure](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-input)

**Implementation Notes**:
```csharp
// SendInput signature
[DllImport("user32.dll", SetLastError = true)]
static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

// INPUT structure
[StructLayout(LayoutKind.Sequential)]
struct INPUT {
    public uint type;  // INPUT_MOUSE = 0
    public MOUSEINPUT mi;
}
```

---

## 2. Coordinate Systems and Normalization

**Decision**: Use MOUSEEVENTF_ABSOLUTE with normalized coordinates (0-65535)

**Rationale**:
- `SendInput` with `MOUSEEVENTF_ABSOLUTE` requires normalized coordinates
- Screen coordinates must be converted to the 0-65535 range
- `MOUSEEVENTF_VIRTUALDESK` flag enables multi-monitor support with negative coordinates

**Formula for Multi-Monitor Normalization**:
```csharp
// Virtual desktop bounds (includes all monitors)
int virtualLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);   // Can be negative
int virtualTop = GetSystemMetrics(SM_YVIRTUALSCREEN);    // Can be negative
int virtualWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
int virtualHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

// Convert screen coordinates to normalized
int normalizedX = (int)(((screenX - virtualLeft) * 65535.0 / virtualWidth) + 0.5);
int normalizedY = (int)(((screenY - virtualTop) * 65535.0 / virtualHeight) + 0.5);
```

**Alternatives Considered**:
- Relative coordinates - REJECTED: Subject to mouse acceleration, unpredictable results
- `SetCursorPos` + relative click - REJECTED: Not atomic, race conditions possible

**Key Documentation**:
- [MOUSEINPUT dx/dy members](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput): "If MOUSEEVENTF_ABSOLUTE value is specified, dx and dy contain normalized absolute coordinates between 0 and 65,535"
- [GetSystemMetrics](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getsystemmetrics): SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN

---

## 3. Per-Monitor V2 DPI Awareness

**Decision**: Declare Per-Monitor V2 DPI awareness in application manifest

**Rationale**:
- Per-Monitor V2 ensures the application sees raw physical pixels (Constitution XVII, FR-005)
- No bitmap scaling by Windows - coordinates are accurate
- Required for correct multi-monitor behavior at different DPI scales

**Implementation**:
```xml
<!-- app.manifest -->
<application xmlns="urn:schemas-microsoft-com:asm.v3">
  <windowsSettings>
    <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">
      PerMonitorV2
    </dpiAwareness>
  </windowsSettings>
</application>
```

**Alternatives Considered**:
- System DPI Aware - REJECTED: Would bitmap stretch on secondary monitors with different DPI
- DPI Unaware - REJECTED: All coordinates would be scaled by Windows

**Key Documentation**:
- [High DPI Desktop Application Development](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows)
- [Setting DPI Awareness](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process)

---

## 4. Elevated Process Detection (UIPI)

**Decision**: Check window under cursor for elevation before sending input

**Rationale**:
- `SendInput` silently fails when targeting elevated processes (returns 0 with no error)
- Detecting elevation beforehand allows meaningful error messages
- UIPI (User Interface Privilege Isolation) prevents standard integrity processes from sending input to elevated processes

**Detection Algorithm**:
```csharp
// 1. Get window handle at target coordinates
IntPtr hwnd = WindowFromPoint(new POINT(x, y));

// 2. Get process ID from window
uint processId;
GetWindowThreadProcessId(hwnd, out processId);

// 3. Open process and its token
IntPtr hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
IntPtr hToken;
OpenProcessToken(hProcess, TOKEN_QUERY, out hToken);

// 4. Query token elevation
TOKEN_ELEVATION elevation;
GetTokenInformation(hToken, TokenElevation, out elevation, ...);
bool isElevated = elevation.TokenIsElevated != 0;
```

**Alternatives Considered**:
- Check foreground window only - REJECTED: May not match click target
- Attempt input and detect failure - REJECTED: No clear error from SendInput on UIPI block

**Key Documentation**:
- [WindowFromPoint](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-windowfrompoint)
- [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid)
- [OpenProcessToken](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocesstoken)
- [GetTokenInformation with TokenElevation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation)

---

## 5. Double-Click Timing

**Decision**: Use `GetDoubleClickTime()` for inter-click delay

**Rationale**:
- Respects user's configured double-click speed (FR-018)
- System default is typically 500ms but user-configurable
- Ensures double-clicks are recognized by Windows as valid

**Implementation**:
```csharp
[DllImport("user32.dll")]
static extern uint GetDoubleClickTime();

// Between first and second click
int doubleClickDelay = (int)GetDoubleClickTime() / 4; // Use fraction for safety margin
await Task.Delay(doubleClickDelay);
```

**Alternatives Considered**:
- Fixed 100ms delay - REJECTED: May not work for users with slow double-click settings
- No delay - REJECTED: Clicks may be too fast for Windows to recognize as double-click

**Key Documentation**:
- [GetDoubleClickTime](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getdoubleclicktime)
- [Mouse Input Overview - Double-Click Messages](https://learn.microsoft.com/en-us/windows/win32/inputdev/about-mouse-input#mouse-messages)

---

## 6. Mouse Button Flags

**Decision**: Use MOUSEINPUT dwFlags for button events

**Reference Table**:

| Action | dwFlags Value |
|--------|---------------|
| Move | `MOUSEEVENTF_MOVE \| MOUSEEVENTF_ABSOLUTE \| MOUSEEVENTF_VIRTUALDESK` |
| Left Down | `MOUSEEVENTF_LEFTDOWN` |
| Left Up | `MOUSEEVENTF_LEFTUP` |
| Right Down | `MOUSEEVENTF_RIGHTDOWN` |
| Right Up | `MOUSEEVENTF_RIGHTUP` |
| Middle Down | `MOUSEEVENTF_MIDDLEDOWN` |
| Middle Up | `MOUSEEVENTF_MIDDLEUP` |
| Wheel (vertical) | `MOUSEEVENTF_WHEEL` (mouseData = WHEEL_DELTA * amount) |
| Wheel (horizontal) | `MOUSEEVENTF_HWHEEL` (mouseData = WHEEL_DELTA * amount) |

**Constants**:
```csharp
const uint MOUSEEVENTF_MOVE = 0x0001;
const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
const uint MOUSEEVENTF_LEFTUP = 0x0004;
const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
const uint MOUSEEVENTF_RIGHTUP = 0x0010;
const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
const uint MOUSEEVENTF_WHEEL = 0x0800;
const uint MOUSEEVENTF_HWHEEL = 0x1000;
const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;

const int WHEEL_DELTA = 120;
```

---

## 7. Modifier Key Handling

**Decision**: Use keyboard INPUT events to press/release modifiers around mouse events

**Rationale**:
- Modifiers must be held during click operations (FR-015)
- Must track and release all pressed modifiers even on failure (FR-008, Constitution XV)
- Query current modifier state to avoid conflicts with user-held keys

**Implementation Pattern**:
```csharp
// Check current modifier state before pressing
bool ctrlAlreadyDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;

// Press modifiers (only if not already held)
if (modifiers.Contains("ctrl") && !ctrlAlreadyDown) {
    SendKeyboardInput(VK_CONTROL, keyDown: true);
    pressedModifiers.Add(VK_CONTROL);
}

try {
    // Perform mouse operation
    SendMouseInput(...);
} finally {
    // Release only modifiers we pressed
    foreach (var vk in pressedModifiers) {
        SendKeyboardInput(vk, keyDown: false);
    }
}
```

**Key APIs**:
- [GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate) - Query current key state
- [KEYBDINPUT structure](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput) - For modifier key events

---

## 8. Screen Bounds Validation

**Decision**: Validate coordinates against virtual screen bounds before operations

**Rationale**:
- FR-010 requires coordinate validation
- Invalid coordinates should return clear error with valid bounds
- Virtual screen encompasses all monitors including negative coordinates

**Implementation**:
```csharp
public bool IsValidScreenCoordinate(int x, int y, out Rectangle validBounds) {
    validBounds = new Rectangle(
        GetSystemMetrics(SM_XVIRTUALSCREEN),
        GetSystemMetrics(SM_YVIRTUALSCREEN),
        GetSystemMetrics(SM_CXVIRTUALSCREEN),
        GetSystemMetrics(SM_CYVIRTUALSCREEN)
    );
    
    return x >= validBounds.Left && x < validBounds.Right &&
           y >= validBounds.Top && y < validBounds.Bottom;
}
```

---

## 9. Window Title Retrieval

**Decision**: Use `GetWindowText` to retrieve window title under cursor

**Rationale**:
- FR-009 requires returning window title in success response
- Provides context for LLM to verify click target

**Implementation**:
```csharp
IntPtr hwnd = WindowFromPoint(new POINT(x, y));
StringBuilder title = new StringBuilder(256);
GetWindowText(hwnd, title, title.Capacity);
return title.ToString();
```

**Key Documentation**:
- [GetWindowText](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw)

---

## 10. Concurrency Control

**Decision**: Use `SemaphoreSlim(1,1)` for mutex-style serialization

**Rationale**:
- Concurrent MCP requests must be serialized (clarification session)
- Prevents interleaved input sequences that could corrupt operations
- `SemaphoreSlim` is lightweight and async-friendly

**Implementation**:
```csharp
private static readonly SemaphoreSlim _operationLock = new(1, 1);

public async Task<MouseControlResult> ExecuteAsync(..., CancellationToken ct) {
    await _operationLock.WaitAsync(ct);
    try {
        // Perform mouse operation
    } finally {
        _operationLock.Release();
    }
}
```

---

## 11. Secure Desktop Detection

**Decision**: Use `OpenInputDesktop` to detect secure desktop (UAC, lock screen)

**Rationale**:
- When a secure desktop is active (UAC prompt, Ctrl+Alt+Del, lock screen), `OpenInputDesktop` returns NULL or a different desktop handle
- This is the only reliable way to detect UIPI restrictions at the desktop level
- `SendInput` will silently fail on secure desktops

**Detection Algorithm**:
```csharp
// Check if we're on the input desktop
IntPtr hDesktop = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP);
if (hDesktop == IntPtr.Zero)
{
    // Secure desktop is active (UAC, lock screen, Ctrl+Alt+Del)
    return true; // IsSecureDesktopActive = true
}

// We got a handle - close it and return false
CloseDesktop(hDesktop);
return false;
```

**Key APIs**:
- [OpenInputDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop)
- [CloseDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-closedesktop)

**P/Invoke Declaration**:
```csharp
[DllImport("user32.dll", SetLastError = true)]
static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

[DllImport("user32.dll", SetLastError = true)]
static extern bool CloseDesktop(IntPtr hDesktop);

const uint DESKTOP_SWITCHDESKTOP = 0x0100;
```

---

## Summary

All NEEDS CLARIFICATION items have been resolved through research:

| Item | Resolution |
|------|------------|
| Coordinate normalization | Use formula with virtual screen metrics |
| UIPI detection | WindowFromPoint → GetWindowThreadProcessId → OpenProcessToken → GetTokenInformation |
| Double-click timing | GetDoubleClickTime() / 4 for inter-click delay |
| Multi-monitor support | MOUSEEVENTF_VIRTUALDESK + SM_*VIRTUALSCREEN metrics |
| DPI awareness | Per-Monitor V2 in manifest |

**Constitution Principle VII Satisfied**: All APIs researched with Microsoft Docs citations.
