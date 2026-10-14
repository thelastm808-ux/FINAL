# Research: Window Management

**Feature**: 003-window-management  
**Date**: 2025-12-07  
**Status**: Complete

---

## 1. Window Enumeration

### Decision: Use EnumWindows with callback filtering

**Rationale**: `EnumWindows` is the standard Win32 API for top-level window enumeration. It provides all visible windows and allows filtering in the callback.

**Alternatives Considered**:
- `FindWindow`/`FindWindowEx`: Only finds specific windows, not enumeration
- UI Automation: Higher overhead, better for accessibility tree traversal
- `GetTopWindow`/`GetWindow` chain: Race conditions, windows can change during traversal

**API Documentation**:
- [EnumWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows)
- [GetWindowText](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw)
- [GetClassName](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclassnamew)
- [IsWindowVisible](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindowvisible)
- [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool IsWindowVisible(IntPtr hWnd);
```

---

## 2. Window Bounds and Position

### Decision: Use GetWindowRect with DWM extended frame bounds

**Rationale**: `GetWindowRect` returns the window rectangle, but DWM shadows extend beyond visible bounds. Use `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` for accurate visual bounds.

**API Documentation**:
- [GetWindowRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect)
- [DwmGetWindowAttribute](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmgetwindowattribute)
- [DWMWA_EXTENDED_FRAME_BOUNDS](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

[DllImport("dwmapi.dll")]
static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const int DWMWA_CLOAKED = 14;
```

---

## 3. Window Activation and Focus

### Decision: Multi-strategy activation with verification

**Rationale**: Windows has foreground lock prevention (since Windows 2000) that blocks arbitrary focus changes. Multiple strategies are needed:

1. **SetForegroundWindow** - works if caller has foreground lock
2. **Alt-key trick** - simulates Alt to release foreground lock
3. **AttachThreadInput** - attach to target thread (risky, use with caution)
4. **ShowWindow(SW_MINIMIZE) then ShowWindow(SW_RESTORE)** - forces activation

**API Documentation**:
- [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
- [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)
- [AllowSetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-allowsetforegroundwindow)
- [AttachThreadInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput)
- [ShowWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool SetForegroundWindow(IntPtr hWnd);

[DllImport("user32.dll")]
static extern IntPtr GetForegroundWindow();

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool AllowSetForegroundWindow(int dwProcessId);

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

const int SW_MINIMIZE = 6;
const int SW_RESTORE = 9;
const int SW_SHOW = 5;
const int SW_MAXIMIZE = 3;
const int SW_HIDE = 0;
```

---

## 4. Window State Detection

### Decision: Use GetWindowPlacement and IsIconic/IsZoomed

**Rationale**: `GetWindowPlacement` returns the show state (normal, minimized, maximized). `IsIconic` and `IsZoomed` are simpler for quick checks.

**API Documentation**:
- [GetWindowPlacement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowplacement)
- [IsIconic](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-isiconic)
- [IsZoomed](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iszoomed)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool IsIconic(IntPtr hWnd);

[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool IsZoomed(IntPtr hWnd);
```

---

## 5. Window Move/Resize

### Decision: Use SetWindowPos for atomic positioning

**Rationale**: `SetWindowPos` is the standard API for window positioning. It supports atomic move+resize in a single call and provides flags for z-order control.

**API Documentation**:
- [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
- [MoveWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-movewindow)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

const uint SWP_NOSIZE = 0x0001;
const uint SWP_NOMOVE = 0x0002;
const uint SWP_NOZORDER = 0x0004;
const uint SWP_NOACTIVATE = 0x0010;
const uint SWP_SHOWWINDOW = 0x0040;
```

---

## 6. Window Close

### Decision: Send WM_CLOSE message

**Rationale**: `WM_CLOSE` is the polite way to close a window - allows the application to prompt for unsaved changes. `PostMessage` is used to avoid blocking.

**API Documentation**:
- [PostMessage](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew)
- [WM_CLOSE](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-close)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

const uint WM_CLOSE = 0x0010;
```

---

## 7. Process Information

### Decision: Use GetWindowThreadProcessId + Process.GetProcessById

**Rationale**: Get PID from window handle, then use .NET Process API for process name and other details.

**API Documentation**:
- [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
```

---

## 8. Monitor Detection

### Decision: Use MonitorFromWindow

**Rationale**: `MonitorFromWindow` returns the monitor handle for a window. Combined with `GetMonitorInfo` for monitor details.

**API Documentation**:
- [MonitorFromWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-monitorfromwindow)
- [GetMonitorInfo](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmonitorinfow)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll")]
static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

const uint MONITOR_DEFAULTTONEAREST = 2;
```

---

## 9. DWM Cloaking (Virtual Desktops)

### Decision: Check DWMWA_CLOAKED attribute

**Rationale**: Windows cloaks windows on other virtual desktops. Check `DwmGetWindowAttribute(DWMWA_CLOAKED)` to detect cloaked windows.

**Cloaking Values**:
- `DWM_CLOAKED_APP = 0x00000001` - cloaked by app
- `DWM_CLOAKED_SHELL = 0x00000002` - cloaked by shell
- `DWM_CLOAKED_INHERITED = 0x00000004` - inherited from owner

**API Documentation**:
- [DWMWA_CLOAKED](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)

**P/Invoke Signatures**:
```csharp
[DllImport("dwmapi.dll")]
static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

const int DWMWA_CLOAKED = 14;
```

---

## 10. Virtual Desktop Detection

### Decision: Use IVirtualDesktopManager COM interface

**Rationale**: `IVirtualDesktopManager::IsWindowOnCurrentVirtualDesktop` detects if a window is on the current virtual desktop. This is the official Windows 10/11 API.

**API Documentation**:
- [IVirtualDesktopManager](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-ivirtualdesktopmanager)

**COM Interface**:
```csharp
[ComImport]
[Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IVirtualDesktopManager
{
    bool IsWindowOnCurrentVirtualDesktop(IntPtr topLevelWindow);
    Guid GetWindowDesktopId(IntPtr topLevelWindow);
    void MoveWindowToDesktop(IntPtr topLevelWindow, ref Guid desktopId);
}

[ComImport]
[Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
class VirtualDesktopManager { }
```

---

## 11. UWP/Store App Detection

### Decision: Check for ApplicationFrameHost process

**Rationale**: UWP apps run inside `ApplicationFrameHost.exe`. Detect by process name and try to get the actual app name from the window's child elements or package identity.

**Detection Pattern**:
1. Get process name via `GetWindowThreadProcessId` + `Process.GetProcessById`
2. If process is "ApplicationFrameHost", window is UWP container
3. Real app name is in the window title (Windows sets it correctly)

---

## 12. Elevated Process Detection

### Decision: Reuse existing elevation detection from mouse/keyboard control

**Rationale**: The project already has `ElevationDetector` that checks if a process is elevated using token queries.

**Existing Code**: `src/Sbroenne.WindowsMcp/Automation/ElevationDetector.cs`

---

## 13. Hung Window Detection

### Decision: Use SendMessageTimeout instead of GetWindowText

**Rationale**: `GetWindowText` can hang indefinitely on unresponsive windows. `SendMessageTimeout` with `SMTO_ABORTIFHUNG` provides timeout support.

**API Documentation**:
- [SendMessageTimeout](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendmessagetimeoutw)

**P/Invoke Signatures**:
```csharp
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, IntPtr wParam, StringBuilder lParam,
    uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

const uint WM_GETTEXT = 0x000D;
const uint SMTO_ABORTIFHUNG = 0x0002;
```

---

## Summary Table

| Capability | API | Notes |
|------------|-----|-------|
| Enumerate windows | EnumWindows | Top-level only, callback filter |
| Get window title | SendMessageTimeout(WM_GETTEXT) | Timeout for hung windows |
| Get window bounds | DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) | Accurate visual bounds |
| Get window state | GetWindowPlacement, IsIconic, IsZoomed | Normal/minimized/maximized |
| Activate window | SetForegroundWindow + strategies | Multi-strategy for reliability |
| Move/resize window | SetWindowPos | Atomic, with flags |
| Close window | PostMessage(WM_CLOSE) | Polite, non-blocking |
| Get process info | GetWindowThreadProcessId + Process API | .NET Process for name |
| Get monitor | MonitorFromWindow + GetMonitorInfo | Multi-monitor support |
| Detect cloaking | DwmGetWindowAttribute(DWMWA_CLOAKED) | Virtual desktop exclusion |
| Virtual desktop | IVirtualDesktopManager COM | Windows 10/11 only |
| UWP detection | Process name check | ApplicationFrameHost |
| Elevation check | Existing ElevationDetector | Token query |
