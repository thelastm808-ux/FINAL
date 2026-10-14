# Research: All Monitors Screenshot Capture

**Feature**: 008-all-monitors-screenshot | **Date**: 2025-12-08

## Executive Summary

This feature adds a new `all_monitors` capture target to the screenshot_control tool. The implementation is straightforward because the existing codebase already has all the necessary infrastructure:

1. `CoordinateNormalizer.GetVirtualScreenBounds()` - Returns virtual screen dimensions
2. `ScreenshotService.CaptureRegionInternalAsync()` - Captures any rectangular region
3. `CaptureTarget` enum - Just needs a new `AllMonitors` value

**Estimated effort**: ~2-4 hours including tests

---

## Research Findings

### 1. Windows Virtual Screen Concept

**Decision**: Use Windows virtual screen coordinates  
**Rationale**: Windows already provides a unified coordinate space spanning all monitors  
**Alternatives considered**: Capture each monitor separately and stitch → Rejected (more complex, existing infrastructure handles this)

**Key APIs** (already implemented in codebase):
```csharp
// From NativeConstants.cs
SM_XVIRTUALSCREEN = 76;   // Left edge (can be negative)
SM_YVIRTUALSCREEN = 77;   // Top edge
SM_CXVIRTUALSCREEN = 78;  // Total width
SM_CYVIRTUALSCREEN = 79;  // Total height

// From CoordinateNormalizer.cs - ALREADY EXISTS
public static ScreenBounds GetVirtualScreenBounds()
{
    var left = NativeMethods.GetSystemMetrics(NativeConstants.SM_XVIRTUALSCREEN);
    var top = NativeMethods.GetSystemMetrics(NativeConstants.SM_YVIRTUALSCREEN);
    var width = NativeMethods.GetSystemMetrics(NativeConstants.SM_CXVIRTUALSCREEN);
    var height = NativeMethods.GetSystemMetrics(NativeConstants.SM_CYVIRTUALSCREEN);
    return new ScreenBounds(left, top, width, height);
}
```

### 2. Existing Infrastructure Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `GetVirtualScreenBounds()` | ✅ Exists | Returns `ScreenBounds` with all needed info |
| `CaptureRegionInternalAsync()` | ✅ Exists | Handles negative coordinates, MaxPixels limit |
| `CaptureTarget` enum | 🔄 Add value | Add `AllMonitors = 4` |
| `ScreenshotControlTool` | 🔄 Update | Add `"all_monitors"` string mapping |
| `ScreenshotService` | 🔄 Add method | New `CaptureAllMonitorsAsync()` method |

### 3. Implementation Approach

**Decision**: Minimal code change leveraging existing infrastructure  
**Rationale**: `CaptureRegionInternalAsync` already handles the core capture logic including:
- Negative coordinates (monitors left of primary)
- MaxPixels limit enforcement
- Cursor drawing at correct offset
- PNG encoding to base64

**New code needed** (~20 lines):
```csharp
// In ScreenshotService.cs
private Task<ScreenshotControlResult> CaptureAllMonitorsAsync(
    ScreenshotControlRequest request,
    CancellationToken cancellationToken)
{
    var bounds = CoordinateNormalizer.GetVirtualScreenBounds();
    var region = new CaptureRegion(bounds.Left, bounds.Top, bounds.Width, bounds.Height);
    return CaptureRegionInternalAsync(region, request.IncludeCursor, cancellationToken);
}
```

### 4. Virtual Screen Information in list_monitors

**Decision**: Add `virtualScreen` property to list_monitors response  
**Rationale**: Helps LLM understand the overall layout before capturing  
**Implementation**: Extend `HandleListMonitors()` to include virtual screen bounds

### 5. Testing Strategy

**Decision**: Integration tests on multi-monitor system  
**Rationale**: Per Constitution XIV, integration tests are primary; must use secondary monitor

**Test cases**:
1. Capture all monitors returns correct dimensions
2. Cursor position correct in combined image
3. MaxPixels limit enforced for very large virtual screens
4. Single-monitor fallback works (same as primary_screen)
5. list_monitors includes virtualScreen property

### 6. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Single monitor | Returns same as `primary_screen` |
| Monitors with gaps | Black regions in gaps (GDI+ default) |
| Very large virtual screen | MaxPixels limit returns error |
| Negative coordinates | Already handled by `CaptureRegionInternalAsync` |
| HDR displays | SDR capture (existing behavior) |

---

## Dependencies

No new dependencies required. Uses:
- `System.Drawing` (existing)
- `NativeMethods.GetSystemMetrics` (existing)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Performance on 4K+ multi-monitor | Low | MaxPixels limit already in place |
| Memory pressure | Low | Existing limit configuration |
| Breaking existing tests | Low | Only adding, not modifying behavior |

---

## Recommendation

**Proceed with implementation.** This is a low-risk, high-value feature that:
- Reuses 95% of existing infrastructure
- Adds ~20 lines of new code
- Enables proper test verification for 007-llm-integration-testing
- Has clear test strategy

**Estimated implementation time**: 2-4 hours including tests
