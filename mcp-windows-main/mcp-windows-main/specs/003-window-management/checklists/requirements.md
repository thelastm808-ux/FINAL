# Specification Quality Checklist: Window Management

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2025-12-07  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

All checklist items pass. The specification is ready for `/speckit.clarify` or `/speckit.plan`.

**Key Design Decisions Made (Reasonable Defaults Applied):**

1. **Window Identification**: Windows identified by handle (HWND) or title search. Handles are numeric and may become invalid.

2. **Top-Level Only**: By default, only top-level visible windows are enumerated. Flags available for hidden/child windows.

3. **Activation Limitations**: Windows focus stealing prevention may occasionally block `SetForegroundWindow`. Success criterion set at 95%.

4. **Close Behavior**: Sends WM_CLOSE message, allows application to show save prompts. Does NOT force-terminate.

5. **Timeout Defaults**: 30 seconds for `wait_for`, 5 seconds for general operations, 100ms for window property queries.

6. **Error Handling**: Same patterns as mouse/keyboard control (elevated process detection, secure desktop detection, structured JSON logging to stderr).

7. **Case Sensitivity**: Title matching is case-insensitive by default.

8. **Coordinate System**: Uses physical screen coordinates consistent with mouse control. Multi-monitor coordinates may be negative.

9. **UWP/Store Apps**: ApplicationFrameHost containers are handled by reporting container process and including real app identity in extended info.

10. **Virtual Desktops**: Windows on other virtual desktops are excluded by default (DWM-cloaked). `include_all_desktops` flag available.

11. **Hung Windows**: 100ms timeout for window property queries. Unresponsive windows reported with "(Not Responding)" title.

12. **Cloaked Windows**: DWM-cloaked windows excluded by default. `include_cloaked` flag available for advanced use.

13. **DPI Awareness**: All coordinates in physical pixels, not DPI-scaled logical units, for mouse control compatibility.

**Relationship to Other Features:**
- **Mouse Control**: Window management provides coordinates for clicking; mouse control performs the clicks.
- **Keyboard Control**: Window management can activate windows; keyboard control sends input to the focused window.
- This creates a complete automation workflow: Find window → Activate → Click/Type.
