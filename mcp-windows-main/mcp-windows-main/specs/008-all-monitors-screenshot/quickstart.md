# Quickstart: All Monitors Screenshot Capture

**Feature**: 008-all-monitors-screenshot | **Date**: 2025-12-08

## What This Feature Does

Adds a new `target="all_monitors"` option to the screenshot_control tool that captures the entire Windows virtual screen (spanning all monitors) in a single screenshot.

## When to Use It

Use `all_monitors` when you need to:
- **Verify test actions happened on the correct monitor** (primary use case)
- **Capture the complete desktop state** across all displays
- **Debug multi-monitor issues** by seeing everything at once

## Basic Usage

### Capture All Monitors

```json
{
  "action": "capture",
  "target": "all_monitors",
  "includeCursor": true
}
```

**Response**:
```json
{
  "success": true,
  "width": 4480,
  "height": 1440,
  "format": "png",
  "imageBase64": "iVBORw0KGgo..."
}
```

### Check Virtual Screen Dimensions First

```json
{
  "action": "list_monitors"
}
```

**Response includes `virtualScreen`**:
```json
{
  "success": true,
  "monitors": [
    { "index": 0, "isPrimary": true, "x": 0, "y": 0, "width": 1920, "height": 1080 },
    { "index": 1, "isPrimary": false, "x": 1920, "y": 0, "width": 2560, "height": 1440 }
  ],
  "virtualScreen": {
    "x": 0,
    "y": 0,
    "width": 4480,
    "height": 1440
  }
}
```

## Integration Test Pattern

The primary use case is before/after verification in LLM integration tests:

```text
1. Call screenshot_control with target="all_monitors" → before.png
2. Perform action (mouse, keyboard, window operation)
3. Call screenshot_control with target="all_monitors" → after.png
4. Compare screenshots - verify change on correct monitor
```

### Example: Verify Right-Click on Secondary Monitor

```text
Step 1: Capture all monitors (before)
Step 2: Move mouse to secondary monitor center
Step 3: Perform right-click
Step 4: Capture all monitors (after)
Step 5: Verify:
  - Context menu visible on SECONDARY monitor
  - PRIMARY monitor unchanged (VS Code not affected)
```

### C# Example: Before/After Screenshot Comparison

```csharp
// Capture before screenshot
var beforeRequest = new ScreenshotControlRequest
{
    Action = ScreenshotAction.Capture,
    Target = CaptureTarget.AllMonitors,
    IncludeCursor = true
};
var beforeResult = await screenshotService.ExecuteAsync(beforeRequest);

// Perform the action being tested
await mouseService.RightClickAsync(secondaryMonitorCenterX, secondaryMonitorCenterY);

// Small delay for UI to update
await Task.Delay(100);

// Capture after screenshot
var afterResult = await screenshotService.ExecuteAsync(beforeRequest);

// Both captures should succeed
Assert.True(beforeResult.Success);
Assert.True(afterResult.Success);

// Dimensions should match (same virtual screen)
Assert.Equal(beforeResult.Width, afterResult.Width);
Assert.Equal(beforeResult.Height, afterResult.Height);

// LLM can now analyze the images to verify:
// - Context menu appeared on secondary monitor
// - Primary monitor content is unchanged
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Must be `"capture"` |
| `target` | string | Yes | Use `"all_monitors"` |
| `includeCursor` | boolean | No | Include mouse cursor in capture (default: false) |

## Error Handling

### Virtual Screen Too Large

If total pixels exceed the configured limit:
```json
{
  "success": false,
  "errorCode": "ImageTooLarge",
  "message": "Capture area (8000x4320 = 34,560,000 pixels) exceeds maximum allowed (33,177,600 pixels)"
}
```

### Secure Desktop Active

If UAC prompt or lock screen is showing:
```json
{
  "success": false,
  "errorCode": "SecureDesktopActive",
  "message": "Cannot capture screenshot while secure desktop (UAC/lock screen) is active"
}
```

## Comparison with Other Targets

| Target | When to Use |
|--------|-------------|
| `primary_screen` | Quick capture of main monitor only |
| `monitor` | Capture specific monitor by index |
| `all_monitors` | **Complete view for test verification** |
| `window` | Capture specific application window |
| `region` | Capture exact rectangular area |

## Performance

- Typical 2-monitor capture: < 500ms
- Image size is larger than single-monitor capture
- Use `monitor` target if you only need one display

## Common Issues

### Image looks mostly black
- Monitors may have gaps between them (normal for non-contiguous arrangements)
- Check `list_monitors` to understand monitor layout

### Cursor not visible
- Set `includeCursor: true` in the request
- Cursor must be within virtual screen bounds
