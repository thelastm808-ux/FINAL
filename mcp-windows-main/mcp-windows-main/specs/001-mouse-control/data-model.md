# Data Model: Mouse Control

**Feature**: 001-mouse-control  
**Date**: 2025-12-07  
**Status**: Complete

---

## Entities

### MouseAction (Enum)

Defines the type of mouse operation to perform.

```csharp
public enum MouseAction
{
    Move,           // Move cursor to coordinates
    Click,          // Left mouse button click
    DoubleClick,    // Double left-click
    RightClick,     // Right mouse button click
    MiddleClick,    // Middle mouse button click
    Drag,           // Mouse drag operation
    Scroll          // Mouse wheel scroll
}
```

**Validation Rules**:
- Must be a valid enum value
- Case-insensitive string parsing supported (e.g., "move", "MOVE", "Move")

---

### MouseButton (Enum)

Specifies which mouse button to use for drag operations.

```csharp
public enum MouseButton
{
    Left,    // Default for most drag operations
    Right,   // Right-button drag (e.g., context menus)
    Middle   // Middle-button drag (rare)
}
```

**Default**: `Left`

---

### ScrollDirection (Enum)

Specifies the direction for scroll operations.

```csharp
public enum ScrollDirection
{
    Up,      // Scroll content upward (wheel away from user)
    Down,    // Scroll content downward (wheel toward user)
    Left,    // Horizontal scroll left
    Right    // Horizontal scroll right
}
```

**Validation Rules**:
- Required for `Scroll` action
- Horizontal scroll may not be supported by all applications

---

### ModifierKey (Enum)

Keyboard modifier keys that can be held during click operations.

```csharp
[Flags]
public enum ModifierKey
{
    None = 0,
    Ctrl = 1,
    Shift = 2,
    Alt = 4
}
```

**Usage**:
- Can combine multiple: `Ctrl | Shift`
- Array input in MCP: `["ctrl", "shift"]`

---

### Coordinates (Value Object)

Represents a screen position in physical pixels.

```csharp
public readonly record struct Coordinates(int X, int Y)
{
    public static Coordinates FromCurrent() => /* GetCursorPos */;
    
    public bool IsValid(ScreenBounds bounds) =>
        X >= bounds.Left && X < bounds.Right &&
        Y >= bounds.Top && Y < bounds.Bottom;
}
```

**Validation Rules**:
- `X` and `Y` must be integers (fractional values truncated)
- Must be within virtual screen bounds
- Can be negative (secondary monitors left of primary)

**Coordinate System**:
- Origin (0,0) is top-left of primary monitor
- Positive X extends right
- Positive Y extends down
- Negative coordinates possible for monitors positioned left/above primary

---

### ScreenBounds (Value Object)

Represents the virtual screen geometry encompassing all monitors.

```csharp
public readonly record struct ScreenBounds(
    int Left,    // Can be negative
    int Top,     // Can be negative
    int Width,
    int Height
)
{
    public int Right => Left + Width;
    public int Bottom => Top + Height;
    
    public static ScreenBounds GetVirtual() => /* GetSystemMetrics */;
}
```

---

### MouseControlRequest (Input Model)

The request payload for the `mouse_control` MCP tool.

```csharp
public sealed record MouseControlRequest
{
    /// <summary>Required: The mouse action to perform.</summary>
    [Required]
    public required MouseAction Action { get; init; }
    
    /// <summary>Optional: X coordinate for move/click/scroll. Uses current position if omitted.</summary>
    public int? X { get; init; }
    
    /// <summary>Optional: Y coordinate for move/click/scroll. Uses current position if omitted.</summary>
    public int? Y { get; init; }
    
    /// <summary>For Drag: Starting X coordinate.</summary>
    public int? StartX { get; init; }
    
    /// <summary>For Drag: Starting Y coordinate.</summary>
    public int? StartY { get; init; }
    
    /// <summary>For Drag: Ending X coordinate.</summary>
    public int? EndX { get; init; }
    
    /// <summary>For Drag: Ending Y coordinate.</summary>
    public int? EndY { get; init; }
    
    /// <summary>For Drag: Which mouse button to use. Default: Left.</summary>
    public MouseButton Button { get; init; } = MouseButton.Left;
    
    /// <summary>For Scroll: Direction to scroll.</summary>
    public ScrollDirection? Direction { get; init; }
    
    /// <summary>For Scroll: Number of scroll clicks. Default: 1.</summary>
    public int Amount { get; init; } = 1;
    
    /// <summary>For Click actions: Modifier keys to hold during click.</summary>
    public ModifierKey[]? Modifiers { get; init; }
}
```

**Validation Rules by Action**:

| Action | Required Fields | Optional Fields |
|--------|-----------------|-----------------|
| Move | `X`, `Y` | — |
| Click | — | `X`, `Y`, `Modifiers` |
| DoubleClick | — | `X`, `Y`, `Modifiers` |
| RightClick | — | `X`, `Y`, `Modifiers` |
| MiddleClick | — | `X`, `Y` |
| Drag | `StartX`, `StartY`, `EndX`, `EndY` | `Button` |
| Scroll | `Direction` | `X`, `Y`, `Amount` |

---

### MouseControlResult (Output Model)

The response payload for the `mouse_control` MCP tool.

```csharp
public sealed record MouseControlResult
{
    /// <summary>Whether the operation completed successfully.</summary>
    [Required]
    public required bool Success { get; init; }
    
    /// <summary>Final cursor position after the operation.</summary>
    [Required]
    public required Coordinates FinalPosition { get; init; }
    
    /// <summary>Title of the window under the cursor (if available).</summary>
    public string? WindowTitle { get; init; }
    
    /// <summary>Error message if operation failed.</summary>
    public string? Error { get; init; }
    
    /// <summary>Error code for programmatic handling.</summary>
    public MouseControlErrorCode? ErrorCode { get; init; }
    
    /// <summary>Additional context for errors (e.g., valid screen bounds).</summary>
    public Dictionary<string, object>? ErrorDetails { get; init; }
}
```

---

### MouseControlErrorCode (Enum)

Standardized error codes for programmatic error handling.

```csharp
public enum MouseControlErrorCode
{
    None = 0,
    
    // Validation errors
    InvalidAction = 100,
    InvalidCoordinates = 101,
    CoordinatesOutOfBounds = 102,
    MissingRequiredParameter = 103,
    InvalidScrollDirection = 104,
    
    // Security/permission errors
    ElevatedProcessTarget = 200,
    SecureDesktopActive = 201,
    InputBlocked = 202,
    
    // Operation errors
    SendInputFailed = 300,
    OperationTimeout = 301,
    WindowLostDuringDrag = 302,
    
    // System errors
    UnexpectedError = 900
}
```

---

## State Transitions

Mouse operations are stateless from the tool's perspective, but the underlying Windows state changes:

```
┌─────────────┐
│   Idle      │ ← Initial state
└─────────────┘
       │
       ▼ (Move)
┌─────────────┐
│ Cursor at   │ ← Cursor repositioned
│ new coords  │
└─────────────┘
       │
       ▼ (Click)
┌─────────────┐
│ Button      │ ← Button pressed
│ Pressed     │
└─────────────┘
       │
       ▼ (Release)
┌─────────────┐
│   Idle      │ ← Button released, back to idle
└─────────────┘
```

**Modifier Key State Machine**:
```
┌─────────────┐
│ Modifiers   │ ← Before operation
│ Released    │
└─────────────┘
       │
       ▼ (Press modifiers)
┌─────────────┐
│ Modifiers   │ ← During click
│ Held        │
└─────────────┘
       │
       ▼ (Always, even on error)
┌─────────────┐
│ Modifiers   │ ← After operation (guaranteed)
│ Released    │
└─────────────┘
```

---

## Invariants

1. **Coordinate Invariant**: All screen coordinates are in physical pixels (not DPI-scaled)
2. **Modifier Release Invariant**: All modifier keys pressed by the tool are released before returning (FR-008)
3. **Position Reporting Invariant**: Final cursor position is always returned, even on partial failure
4. **Serialization Invariant**: Concurrent operations are serialized; no interleaving occurs
5. **Bounds Invariant**: Operations on out-of-bounds coordinates fail with clear error before any input is sent

---

## JSON Schema Reference

See [contracts/mouse_control.json](contracts/mouse_control.json) for the complete MCP tool schema.
