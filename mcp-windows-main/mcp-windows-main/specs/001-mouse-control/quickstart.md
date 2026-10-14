# Quickstart: Mouse Control MCP Tool

**Feature**: 001-mouse-control  
**Date**: 2025-12-07  
**Status**: Complete

## Overview

The `mouse_control` MCP tool enables LLMs to perform mouse operations on Windows 11. This guide covers installation, configuration, and common usage patterns.

---

## Prerequisites

- Windows 11 (required)
- .NET 8.0 Runtime or SDK
- MCP-compatible client (e.g., VS Code with Copilot Agent, Claude Desktop)

---

## Installation

### Option 1: VS Code Extension (Bundled)

1. Install the extension from the VS Code Marketplace (coming soon)
2. The MCP server starts automatically when you open VS Code
3. No additional configuration required

### Option 2: Standalone Server

```powershell
# Clone and build
git clone https://github.com/sbroenne/mcp-windows.git
cd mcp-windows
dotnet build -c Release

# Run the MCP server
./src/Sbroenne.WindowsMcp/bin/Release/net8.0/Sbroenne.WindowsMcp.exe
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_MOUSE_TIMEOUT_MS` | Operation timeout in milliseconds | `5000` |

### VS Code Settings (Bundled Mode)

```json
{
  "mcp-windows.mouseControl.timeoutMs": 5000
}
```

---

## Tool Schema

```json
{
  "name": "mouse_control",
  "description": "Control mouse cursor, perform clicks, drags, and scroll operations on Windows desktop.",
  "parameters": {
    "action": "move | click | double_click | right_click | middle_click | drag | scroll",
    "x": "integer (optional for clicks)",
    "y": "integer (optional for clicks)",
    "start_x": "integer (drag only)",
    "start_y": "integer (drag only)",
    "end_x": "integer (drag only)",
    "end_y": "integer (drag only)",
    "button": "left | right | middle (drag only, default: left)",
    "direction": "up | down | left | right (scroll only)",
    "amount": "integer 1-100 (scroll only, default: 1)",
    "modifiers": "['ctrl', 'shift', 'alt'] (click only)"
  }
}
```

---

## Usage Examples

### Move Cursor

Move the cursor to an absolute screen position.

```json
{
  "action": "move",
  "x": 500,
  "y": 300
}
```

**Response:**
```json
{
  "success": true,
  "final_position": { "x": 500, "y": 300 },
  "window_title": "Visual Studio Code"
}
```

---

### Click at Current Position

Click wherever the cursor currently is.

```json
{
  "action": "click"
}
```

---

### Click at Coordinates

Move and click in one operation.

```json
{
  "action": "click",
  "x": 800,
  "y": 600
}
```

---

### Ctrl+Click (Modifier Click)

Hold Ctrl while clicking (e.g., for multi-select).

```json
{
  "action": "click",
  "x": 100,
  "y": 200,
  "modifiers": ["ctrl"]
}
```

---

### Double-Click

Open a file or activate an item.

```json
{
  "action": "double_click",
  "x": 100,
  "y": 200
}
```

---

### Right-Click (Context Menu)

Open a context menu at the current position.

```json
{
  "action": "right_click"
}
```

---

### Drag and Drop

Move an item from start to end coordinates.

```json
{
  "action": "drag",
  "start_x": 100,
  "start_y": 100,
  "end_x": 300,
  "end_y": 300
}
```

---

### Drag with Right Button

Right-button drag (e.g., for copy/move menus).

```json
{
  "action": "drag",
  "start_x": 100,
  "start_y": 100,
  "end_x": 300,
  "end_y": 300,
  "button": "right"
}
```

---

### Scroll Down

Scroll content downward (wheel toward user).

```json
{
  "action": "scroll",
  "direction": "down",
  "amount": 3
}
```

---

### Scroll at Position

Scroll at a specific location.

```json
{
  "action": "scroll",
  "x": 500,
  "y": 400,
  "direction": "up",
  "amount": 5
}
```

---

## Error Handling

### Coordinates Out of Bounds

```json
{
  "success": false,
  "final_position": { "x": 1920, "y": 540 },
  "error": "Coordinates (5000, 300) are outside the valid screen bounds",
  "error_code": "coordinates_out_of_bounds",
  "error_details": {
    "valid_bounds": {
      "left": 0,
      "top": 0,
      "right": 3840,
      "bottom": 1080
    }
  }
}
```

**Recovery**: Use the `valid_bounds` in the error to choose valid coordinates.

---

### Elevated Process Target

```json
{
  "success": false,
  "final_position": { "x": 500, "y": 300 },
  "error": "Cannot send input to elevated process 'Task Manager' due to Windows UIPI restrictions",
  "error_code": "elevated_process_target"
}
```

**Recovery**: Choose a different target or instruct the user to close the elevated window.

---

### Secure Desktop Active

```json
{
  "success": false,
  "final_position": { "x": 0, "y": 0 },
  "error": "Cannot send input while secure desktop (UAC or lock screen) is active",
  "error_code": "secure_desktop_active"
}
```

**Recovery**: Wait for the user to dismiss the UAC prompt or unlock the screen.

---

## Multi-Monitor Support

The tool supports multi-monitor setups with negative coordinates:

- Primary monitor: `(0, 0)` to `(width, height)`
- Monitor to the left: `(-secondWidth, 0)` to `(0, height)`
- Monitor above: `(0, -secondHeight)` to `(width, 0)`

**Example**: Click on a monitor positioned to the left of primary:

```json
{
  "action": "click",
  "x": -500,
  "y": 400
}
```

---

## Best Practices

### 1. Verify Cursor Position Before Actions

Always check the tool's response to confirm the cursor moved correctly.

### 2. Use Coordinates When Possible

Providing explicit coordinates is more reliable than clicking at "current position."

### 3. Handle Errors Gracefully

Check `success` and `error_code` in responses to implement fallback logic.

### 4. Respect UIPI Limitations

The tool cannot interact with elevated (admin) processes. Design workflows to work with standard applications.

### 5. Use Modifier Keys for Efficiency

Combine `modifiers` with clicks for operations like Ctrl+Click (multi-select) or Shift+Click (range select).

---

## Troubleshooting

### "SendInput failed" Errors

- **Cause**: Another process may be blocking input
- **Solution**: Close screen capture or remote desktop software

### Click Not Registering

- **Cause**: Target window may have lost focus
- **Solution**: Use explicit coordinates to ensure the correct window is targeted

### Drag Operation Partially Completed

- **Cause**: Target window may have moved or closed during drag
- **Solution**: Check `error_code` for `window_lost_during_drag` and retry

---

## API Reference

See:
- [data-model.md](data-model.md) - Entity definitions
- [contracts/mouse_control.json](contracts/mouse_control.json) - Full JSON schema
