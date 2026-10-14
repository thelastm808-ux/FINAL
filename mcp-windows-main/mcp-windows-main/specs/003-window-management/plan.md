# Implementation Plan: Window Management

**Branch**: `003-window-management` | **Date**: 2025-12-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-window-management/spec.md`

## Summary

Implement a `window_management` MCP tool enabling LLM agents to enumerate, find, activate, and control Windows desktop windows. Uses Windows APIs (EnumWindows, SetForegroundWindow, ShowWindow) with support for multi-monitor, virtual desktops, UWP apps, and DPI-aware coordinates. Integrates with existing mouse/keyboard control for complete desktop automation workflows.

## Technical Context

**Language/Version**: C# 12+ / .NET 8.0 LTS  
**Primary Dependencies**: MCP C# SDK, Microsoft.Extensions.Logging, Serilog  
**Storage**: N/A (stateless window queries)  
**Testing**: xUnit 2.6+ with native assertions, NSubstitute  
**Target Platform**: Windows 11 only  
**Project Type**: Single project (existing structure)  
**Performance Goals**: Window listing < 500ms, all operations < 5s default timeout  
**Constraints**: UIPI blocks elevated windows, focus stealing prevention may block activation  
**Scale/Scope**: Single desktop session, all visible top-level windows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First Development | ✅ Pass | Integration tests for all window operations |
| VI. Augmentation, Not Duplication | ✅ Pass | Returns raw window data for LLM interpretation |
| VII. Windows API Documentation-First | ✅ Pass | Research phase will document all APIs |
| VIII. Security Best Practices | ✅ Pass | Input validation, UIPI detection |
| XIII. Modern .NET & C# | ✅ Pass | Using records, async/await, nullable |
| XIV. xUnit Testing | ✅ Pass | Native xUnit assertions |
| XV. Input Simulation | ✅ Pass | Uses SetForegroundWindow, not SendInput |
| XVII. Coordinate Systems & DPI | ✅ Pass | Physical pixels, Per-Monitor V2 |
| XVIII. Elevated Process Handling | ✅ Pass | Detect and report UIPI errors |
| XX. Window Activation & Focus | ✅ Pass | Multi-strategy activation approach |
| XXII. Open Source Only | ✅ Pass | No commercial dependencies |

### Post-Design Re-evaluation (Phase 1 Complete)

| Principle | Status | Validation |
|-----------|--------|------------|
| VII. Windows API Documentation | ✅ Verified | research.md documents 13 APIs with links |
| XVII. Coordinate Systems | ✅ Verified | data-model.md specifies physical pixels |
| XVIII. Elevated Process Handling | ✅ Verified | WindowInfo.is_elevated, ElevatedWindowActive error code |
| XX. Window Activation | ✅ Verified | Multi-strategy in research.md, contracts include activation |

**Phase Status:**
- ✅ **Phase 0 Complete**: research.md with all Windows API documentation
- ✅ **Phase 1 Complete**: data-model.md, quickstart.md, contracts/window_management.json
- ⏳ **Phase 2 Pending**: Run `/speckit.tasks` to generate tasks.md

## Project Structure

### Documentation (this feature)

```text
specs/003-window-management/
├── plan.md              # This file
├── research.md          # Phase 0: Windows API research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Usage examples
├── contracts/           # Phase 1: JSON schema
│   └── window_management.json
├── checklists/
│   └── requirements.md  # Specification checklist
└── tasks.md             # Phase 2: Task breakdown (/speckit.tasks)
```

### Source Code (repository root)

```text
src/Sbroenne.WindowsMcp/
├── Configuration/
│   └── WindowConfiguration.cs       # NEW: Timeout settings
├── Models/
│   ├── WindowInfo.cs                # NEW: Window information record
│   ├── WindowState.cs               # NEW: Window state enum
│   ├── WindowAction.cs              # NEW: Action enum
│   ├── WindowBounds.cs              # NEW: Position/size record
│   ├── WindowManagementRequest.cs   # NEW: Request model
│   ├── WindowManagementResult.cs    # NEW: Result model
│   └── WindowManagementErrorCode.cs # NEW: Error codes
├── Native/
│   ├── NativeMethods.cs             # MODIFY: Add window APIs
│   ├── NativeConstants.cs           # MODIFY: Add window constants
│   └── NativeStructs.cs             # MODIFY: Add RECT, POINT, etc.
├── Window/                          # NEW: Window management
│   ├── IWindowService.cs            # NEW: Interface
│   ├── WindowService.cs             # NEW: Implementation
│   ├── WindowEnumerator.cs          # NEW: EnumWindows wrapper
│   └── WindowActivator.cs           # NEW: Focus management
├── Logging/
│   └── WindowOperationLogger.cs     # NEW: Structured logging
└── Tools/
    └── WindowManagementTool.cs      # NEW: MCP tool

tests/Sbroenne.WindowsMcp.Tests/
├── Integration/
│   ├── WindowListTests.cs           # NEW
│   ├── WindowFindTests.cs           # NEW
│   ├── WindowActivateTests.cs       # NEW
│   ├── WindowStateTests.cs          # NEW
│   ├── WindowMoveResizeTests.cs     # NEW
│   └── WindowWaitTests.cs           # NEW
└── Unit/
    ├── WindowConfigurationTests.cs  # NEW
    └── WindowEnumeratorTests.cs     # NEW
```

**Structure Decision**: Follows existing keyboard/mouse control pattern. New `Window/` folder for window-specific services, models in `Models/`, native interop extensions in `Native/`.

## Complexity Tracking

> No constitution violations requiring justification.
