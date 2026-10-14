# Window Management Tool - Quick Start Guide

## Overview

The `window_management` tool provides comprehensive window control on Windows, including:
- Enumerating and finding windows
- Activating, minimizing, maximizing, restoring windows
- Moving and resizing windows
- Waiting for windows to appear
- Multi-monitor and virtual desktop support

## Basic Usage

### List All Windows

```json
{
  "action": "list"
}
```

Returns all visible windows on the current virtual desktop.

### List with Filter

```json
{
  "action": "list",
  "filter": "notepad"
}
```

Filters by title or process name (case-insensitive substring match).

### Find Window by Title

```json
{
  "action": "find",
  "title": "Untitled - Notepad"
}
```

Returns the first window matching the title (substring match).

### Find with Regex

```json
{
  "action": "find",
  "title": ".*\\.txt - Notepad",
  "regex": true
}
```

Use regex for complex matching patterns.

## Window Activation

### Activate by Handle

```json
{
  "action": "activate",
  "handle": "123456"
}
```

Brings window to foreground and gives it focus.

### Get Current Foreground Window

```json
{
  "action": "get_foreground"
}
```

Returns the currently active window.

## Window State Changes

### Minimize

```json
{
  "action": "minimize",
  "handle": "123456"
}
```

### Maximize

```json
{
  "action": "maximize",
  "handle": "123456"
}
```

### Restore

```json
{
  "action": "restore",
  "handle": "123456"
}
```

Restores a minimized or maximized window to normal state.

### Close

```json
{
  "action": "close",
  "handle": "123456"
}
```

Sends WM_CLOSE to request graceful window closure.

## Window Positioning

### Move Window

```json
{
  "action": "move",
  "handle": "123456",
  "x": 100,
  "y": 100
}
```

Moves window's top-left corner to specified position.

### Resize Window

```json
{
  "action": "resize",
  "handle": "123456",
  "width": 800,
  "height": 600
}
```

Changes window dimensions while preserving position.

### Set Bounds (Move + Resize)

```json
{
  "action": "set_bounds",
  "handle": "123456",
  "x": 100,
  "y": 100,
  "width": 800,
  "height": 600
}
```

Sets both position and size in a single operation.

## Waiting for Windows

### Wait for Window to Appear

```json
{
  "action": "wait_for",
  "title": "Save As",
  "timeout_ms": 10000
}
```

Polls until a window matching the title appears (useful for dialogs).

## Advanced Options

### Include Hidden Windows

```json
{
  "action": "list",
  "include_hidden": true
}
```

### Include All Virtual Desktops

```json
{
  "action": "list",
  "include_all_desktops": true
}
```

### Include Cloaked Windows

```json
{
  "action": "list",
  "include_cloaked": true
}
```

DWM-cloaked windows are typically on other virtual desktops.

## Response Format

### Successful List Response

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

### Successful Single Window Response

```json
{
  "success": true,
  "window": {
    "handle": "123456",
    "title": "Untitled - Notepad",
    "is_foreground": true
  },
  "message": "Window activated successfully"
}
```

### Error Response

```json
{
  "success": false,
  "error_code": "WindowNotFound",
  "error": "No window found matching title 'NonExistent'"
}
```

## Error Handling

### Common Error Codes

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `WindowNotFound` | No matching window | Verify title/handle, use list to find |
| `WindowNotResponding` | Window is hung | Wait or skip the window |
| `ElevatedWindowActive` | Target is admin | Cannot control from non-admin |
| `ActivationFailed` | Could not activate | Window may be on other desktop |
| `WaitTimeout` | Timeout waiting | Increase timeout or verify app launched |
| `InvalidHandle` | Handle invalid | Window may have closed |

### Best Practices

1. **Always check `success`** before using results
2. **Use `find` or `list`** to get handles before operations
3. **Handle stale handles** - windows can close anytime
4. **Check `is_responding`** before operations on hung windows
5. **Use `wait_for`** after launching applications

## Common Workflows

### Activate Application by Name

```json
// Step 1: Find the window
{ "action": "find", "title": "Visual Studio Code" }

// Step 2: Use returned handle to activate
{ "action": "activate", "handle": "<returned_handle>" }
```

### Tile Two Windows Side-by-Side

```json
// Left window
{ "action": "set_bounds", "handle": "<handle1>", "x": 0, "y": 0, "width": 960, "height": 1080 }

// Right window
{ "action": "set_bounds", "handle": "<handle2>", "x": 960, "y": 0, "width": 960, "height": 1080 }
```

### Wait for Dialog and Close It

```json
// Wait for dialog
{ "action": "wait_for", "title": "Confirm", "timeout_ms": 5000 }

// Close it
{ "action": "close", "handle": "<returned_handle>" }
```

### Find All Chrome Windows

```json
{ "action": "list", "filter": "chrome" }
```

### Minimize All Notepad Windows

```json
// Step 1: List all notepad windows
{ "action": "list", "filter": "notepad" }

// Step 2: Minimize each one (for each handle in results)
{ "action": "minimize", "handle": "<handle>" }
```

## Coordinate System

- All coordinates are in **physical screen pixels**
- Origin (0,0) is top-left of primary monitor
- Negative coordinates are valid (monitors left/above primary)
- Consistent with mouse_control tool coordinates

## Virtual Desktop Support

- By default, only windows on current virtual desktop are listed
- Use `include_all_desktops: true` to see all
- `on_current_desktop` field indicates desktop membership
- Activating window on another desktop may switch desktops

## UWP/Store App Support

- UWP apps are detected via `ApplicationFrameHost.exe`
- `is_uwp: true` indicates a UWP/Store application
- UWP apps work like regular windows for most operations
- Some UWP apps may have multiple frame windows

## Integration with Other Tools

### With mouse_control

```json
// Activate window, then click in it
{ "action": "activate", "handle": "<handle>" }
// Use mouse_control to click at coordinates within window bounds
```

### With keyboard_control

```json
// Activate window, then send keystrokes
{ "action": "activate", "handle": "<handle>" }
// Use keyboard_control to type or send shortcuts
```

## Performance Considerations

- **list** enumerates all windows - may be slow with many windows
- Use **filter** to reduce enumeration work when possible
- **find** returns first match and is faster than list for single window
- **wait_for** polls every 100ms by default
- Hung window detection adds ~100ms per window being checked
