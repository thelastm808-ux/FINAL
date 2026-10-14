# Data Model: All Monitors Screenshot Capture

**Feature**: 008-all-monitors-screenshot | **Date**: 2025-12-08 | **Version**: 1.0

## Overview

This feature extends the existing screenshot capture data model with a new capture target. No new entities are introduced - only extensions to existing types.

---

## Entity Changes

### 1. CaptureTarget (Enum Extension)

**Location**: `src/Sbroenne.WindowsMcp/Models/CaptureTarget.cs`

| Value | Name | Description |
|-------|------|-------------|
| 0 | PrimaryScreen | Capture the primary monitor (existing) |
| 1 | Monitor | Capture a specific monitor by index (existing) |
| 2 | Window | Capture a specific window by handle (existing) |
| 3 | Region | Capture a rectangular screen region (existing) |
| **4** | **AllMonitors** | **Capture the entire virtual screen spanning all monitors (NEW)** |

---

### 2. VirtualScreenInfo (New Record)

**Purpose**: Represents the combined virtual screen dimensions for `list_monitors` response enhancement.

| Field | Type | Description |
|-------|------|-------------|
| `x` | int | Left edge of virtual screen (can be negative) |
| `y` | int | Top edge of virtual screen |
| `width` | int | Total width spanning all monitors |
| `height` | int | Total height spanning all monitors |

**Note**: This maps directly to the existing `ScreenBounds` record from `CoordinateNormalizer.GetVirtualScreenBounds()`.

---

### 3. MonitorListResult (Extension)

**Current fields** (unchanged):
- `monitors`: Array of monitor info objects

**New field**:
- `virtualScreen`: VirtualScreenInfo object containing combined bounds

---

## Tool Parameter Changes

### screenshot_control Tool

**Existing `target` parameter values**:
- `"primary_screen"` (default)
- `"monitor"`
- `"window"`
- `"region"`

**New value**:
- `"all_monitors"` - Captures entire virtual screen

**Parameter compatibility**:
- `includeCursor`: ✅ Works with all_monitors
- `monitorIndex`: ❌ Not applicable (ignored)
- `windowHandle`: ❌ Not applicable (ignored)
- `regionX/Y/Width/Height`: ❌ Not applicable (ignored)

---

## Response Format

### Successful all_monitors capture

```json
{
  "success": true,
  "width": 4480,
  "height": 1440,
  "format": "png",
  "imageBase64": "iVBORw0KGgo..."
}
```

### Enhanced list_monitors response

```json
{
  "success": true,
  "monitors": [
    {
      "index": 0,
      "isPrimary": true,
      "x": 0,
      "y": 0,
      "width": 1920,
      "height": 1080
    },
    {
      "index": 1,
      "isPrimary": false,
      "x": 1920,
      "y": 0,
      "width": 2560,
      "height": 1440
    }
  ],
  "virtualScreen": {
    "x": 0,
    "y": 0,
    "width": 4480,
    "height": 1440
  },
  "message": "Found 2 monitor(s)"
}
```

---

## Validation Rules

### all_monitors capture
1. Virtual screen dimensions MUST be positive (width > 0, height > 0)
2. Total pixels (width × height) MUST NOT exceed `MaxPixels` configuration limit
3. Secure desktop check MUST pass before capture

### No additional validation needed
- Virtual screen coordinates are always valid (provided by Windows)
- Existing `CaptureRegionInternalAsync` handles all edge cases

---

## Error Codes

No new error codes required. Existing codes apply:

| Code | When Used |
|------|-----------|
| `ImageTooLarge` | Virtual screen exceeds MaxPixels limit |
| `SecureDesktopActive` | UAC/lock screen is active |
| `CaptureError` | GDI+ capture failure |

---

## Backward Compatibility

✅ **Fully backward compatible**

- All existing `target` values work unchanged
- New `virtualScreen` field in list_monitors is additive
- Existing tests require no modification
