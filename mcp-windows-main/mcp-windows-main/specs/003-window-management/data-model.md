# Data Model: Window Management

**Feature**: 003-window-management  
**Date**: 2025-12-07  
**Status**: Complete

---

## 1. Actions

| Action | Description |
|--------|-------------|
| List | Enumerate all visible top-level windows |
| Find | Search for windows by title (substring or regex) |
| Activate | Bring window to foreground and give focus |
| GetForeground | Get current foreground window info |
| Minimize | Minimize window to taskbar |
| Maximize | Maximize window to fill screen |
| Restore | Restore window to normal state |
| Close | Send WM_CLOSE to window |
| Move | Move window to new position |
| Resize | Resize window to new dimensions |
| SetBounds | Move and resize atomically |
| WaitFor | Wait for window to appear |

---

## 2. WindowAction Enum

```csharp
public enum WindowAction
{
    List,
    Find,
    Activate,
    GetForeground,
    Minimize,
    Maximize,
    Restore,
    Close,
    Move,
    Resize,
    SetBounds,
    WaitFor
}
```

---

## 3. WindowState Enum

```csharp
public enum WindowState
{
    Normal,
    Minimized,
    Maximized,
    Hidden
}
```

---

## 4. WindowInfo Record

Complete information about a window.

```csharp
public sealed record WindowInfo
{
    /// <summary>Window handle (HWND) as decimal string for JSON safety.</summary>
    [JsonPropertyName("handle")]
    public required string Handle { get; init; }

    /// <summary>Window title text.</summary>
    [JsonPropertyName("title")]
    public required string Title { get; init; }

    /// <summary>Window class name (e.g., "Notepad", "Chrome_WidgetWin_1").</summary>
    [JsonPropertyName("class_name")]
    public required string ClassName { get; init; }

    /// <summary>Process name (e.g., "notepad.exe", "chrome.exe").</summary>
    [JsonPropertyName("process_name")]
    public required string ProcessName { get; init; }

    /// <summary>Process ID.</summary>
    [JsonPropertyName("process_id")]
    public required int ProcessId { get; init; }

    /// <summary>Window bounds (position and size).</summary>
    [JsonPropertyName("bounds")]
    public required WindowBounds Bounds { get; init; }

    /// <summary>Window state (normal, minimized, maximized, hidden).</summary>
    [JsonPropertyName("state")]
    public required WindowState State { get; init; }

    /// <summary>Monitor index (0-based) the window is primarily on.</summary>
    [JsonPropertyName("monitor_index")]
    public required int MonitorIndex { get; init; }

    /// <summary>Whether the window is on the current virtual desktop.</summary>
    [JsonPropertyName("on_current_desktop")]
    public bool OnCurrentDesktop { get; init; } = true;

    /// <summary>Whether the window's process is elevated (admin).</summary>
    [JsonPropertyName("is_elevated")]
    public bool IsElevated { get; init; }

    /// <summary>Whether the window is responding to messages.</summary>
    [JsonPropertyName("is_responding")]
    public bool IsResponding { get; init; } = true;

    /// <summary>Whether this is a UWP/Store app.</summary>
    [JsonPropertyName("is_uwp")]
    public bool IsUwp { get; init; }

    /// <summary>Whether the window has foreground focus.</summary>
    [JsonPropertyName("is_foreground")]
    public bool IsForeground { get; init; }
}
```

---

## 5. WindowBounds Record

Position and size of a window in physical screen pixels.

```csharp
public sealed record WindowBounds
{
    /// <summary>Left edge X coordinate.</summary>
    [JsonPropertyName("x")]
    public required int X { get; init; }

    /// <summary>Top edge Y coordinate.</summary>
    [JsonPropertyName("y")]
    public required int Y { get; init; }

    /// <summary>Window width.</summary>
    [JsonPropertyName("width")]
    public required int Width { get; init; }

    /// <summary>Window height.</summary>
    [JsonPropertyName("height")]
    public required int Height { get; init; }

    /// <summary>Right edge X coordinate (computed).</summary>
    [JsonIgnore]
    public int Right => X + Width;

    /// <summary>Bottom edge Y coordinate (computed).</summary>
    [JsonIgnore]
    public int Bottom => Y + Height;
}
```

---

## 6. WindowManagementRequest Record

Request parameters for window management operations.

```csharp
public sealed record WindowManagementRequest
{
    /// <summary>The action to perform.</summary>
    public required WindowAction Action { get; init; }

    /// <summary>Window handle (for operations on specific window).</summary>
    public string? Handle { get; init; }

    /// <summary>Title search string (for find/wait_for).</summary>
    public string? Title { get; init; }

    /// <summary>Whether title is a regex pattern.</summary>
    public bool Regex { get; init; }

    /// <summary>Filter for list action (matches title or process name).</summary>
    public string? Filter { get; init; }

    /// <summary>X coordinate for move/set_bounds.</summary>
    public int? X { get; init; }

    /// <summary>Y coordinate for move/set_bounds.</summary>
    public int? Y { get; init; }

    /// <summary>Width for resize/set_bounds.</summary>
    public int? Width { get; init; }

    /// <summary>Height for resize/set_bounds.</summary>
    public int? Height { get; init; }

    /// <summary>Timeout in milliseconds for wait_for.</summary>
    public int? TimeoutMs { get; init; }

    /// <summary>Include hidden (non-visible) windows.</summary>
    public bool IncludeHidden { get; init; }

    /// <summary>Include windows on other virtual desktops.</summary>
    public bool IncludeAllDesktops { get; init; }

    /// <summary>Include DWM-cloaked windows.</summary>
    public bool IncludeCloaked { get; init; }
}
```

---

## 7. WindowManagementResult Record

Result of a window management operation.

```csharp
public sealed record WindowManagementResult
{
    /// <summary>Whether the operation succeeded.</summary>
    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    /// <summary>Error code if operation failed.</summary>
    [JsonPropertyName("error_code")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public WindowManagementErrorCode ErrorCode { get; init; }

    /// <summary>Error message if operation failed.</summary>
    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; init; }

    /// <summary>Single window info (for find, activate, get_foreground, etc.).</summary>
    [JsonPropertyName("window")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public WindowInfo? Window { get; init; }

    /// <summary>List of windows (for list action).</summary>
    [JsonPropertyName("windows")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<WindowInfo>? Windows { get; init; }

    /// <summary>Number of windows found/affected.</summary>
    [JsonPropertyName("count")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Count { get; init; }

    /// <summary>Message for informational results.</summary>
    [JsonPropertyName("message")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Message { get; init; }
}
```

---

## 8. WindowManagementErrorCode Enum

Standardized error codes for programmatic handling.

```csharp
public enum WindowManagementErrorCode
{
    None = 0,

    // Input validation errors
    InvalidAction = 100,
    InvalidHandle = 101,
    MissingRequiredParameter = 102,
    InvalidCoordinates = 103,
    InvalidRegexPattern = 104,

    // Window state errors
    WindowNotFound = 200,
    WindowClosed = 201,
    WindowNotResponding = 202,
    HandleInvalid = 203,

    // Operation errors
    ActivationFailed = 300,
    MoveFailed = 301,
    ResizeFailed = 302,
    CloseFailed = 303,
    StateChangeFailed = 304,

    // Access errors
    ElevatedWindowActive = 400,
    SecureDesktopActive = 401,
    AccessDenied = 402,

    // Timeout errors
    Timeout = 500,
    WaitTimeout = 501,

    // System errors
    EnumerationFailed = 600,
    ProcessAccessDenied = 601,
    SystemError = 999
}
```

---

## 9. WindowConfiguration Record

Configuration settings for window operations.

```csharp
public sealed record WindowConfiguration
{
    /// <summary>Default timeout for operations in milliseconds.</summary>
    public int DefaultTimeoutMs { get; init; } = 5000;

    /// <summary>Default timeout for wait_for action in milliseconds.</summary>
    public int WaitForTimeoutMs { get; init; } = 30000;

    /// <summary>Timeout for querying window properties (hung detection).</summary>
    public int PropertyQueryTimeoutMs { get; init; } = 100;

    /// <summary>Polling interval for wait_for action in milliseconds.</summary>
    public int WaitForPollIntervalMs { get; init; } = 100;

    /// <summary>Maximum number of activation retry attempts.</summary>
    public int ActivationMaxRetries { get; init; } = 3;

    /// <summary>Delay between activation retries in milliseconds.</summary>
    public int ActivationRetryDelayMs { get; init; } = 100;
}
```

---

## 10. Entity Relationships

```text
WindowManagementRequest
├── Action: WindowAction
├── Handle? ──────────────────────────┐
├── Title? (for find/wait_for)        │
├── Filter? (for list)                │
├── X?, Y?, Width?, Height?           │
└── TimeoutMs?                        │
                                      │
                                      ▼
WindowManagementResult
├── Success: bool
├── ErrorCode?: WindowManagementErrorCode
├── Error?: string
├── Window?: WindowInfo ──────────────┐
├── Windows?: WindowInfo[]            │
├── Count?: int                       │
└── Message?: string                  │
                                      │
                                      ▼
WindowInfo
├── Handle: string (HWND as decimal)
├── Title: string
├── ClassName: string
├── ProcessName: string
├── ProcessId: int
├── Bounds: WindowBounds
│   ├── X, Y, Width, Height
│   └── Right, Bottom (computed)
├── State: WindowState
├── MonitorIndex: int
├── OnCurrentDesktop: bool
├── IsElevated: bool
├── IsResponding: bool
├── IsUwp: bool
└── IsForeground: bool
```

---

## 11. JSON Examples

### List Windows Request
```json
{
  "action": "list",
  "filter": "notepad"
}
```

### List Windows Response
```json
{
  "success": true,
  "windows": [
    {
      "handle": "123456",
      "title": "Untitled - Notepad",
      "class_name": "Notepad",
      "process_name": "notepad.exe",
      "process_id": 1234,
      "bounds": { "x": 100, "y": 100, "width": 800, "height": 600 },
      "state": "Normal",
      "monitor_index": 0,
      "on_current_desktop": true,
      "is_elevated": false,
      "is_responding": true,
      "is_uwp": false,
      "is_foreground": false
    }
  ],
  "count": 1
}
```

### Activate Window Request
```json
{
  "action": "activate",
  "handle": "123456"
}
```

### Activate Window Response
```json
{
  "success": true,
  "window": {
    "handle": "123456",
    "title": "Untitled - Notepad",
    "is_foreground": true
  }
}
```

### Error Response
```json
{
  "success": false,
  "error_code": "ElevatedWindowActive",
  "error": "Cannot activate window - target process 'AdminApp.exe' is running elevated"
}
```
