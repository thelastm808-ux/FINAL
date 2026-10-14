# Implementation Plan: Mouse Control

Branch: `001-mouse-control`  
Date: 2025-12-07

## Summary

Implement a unified MCP tool `mouse_control` enabling LLMs to perform all standard mouse operations on Windows 11: cursor movement, single/double/right/middle clicks, clicks with modifier keys, drag-and-drop, and scrolling. The tool uses the Windows `SendInput` API with proper DPI awareness, multi-monitor support, and UIPI (elevated process) detection. Scope includes all 8 user stories from the specification; explicitly excluded are keyboard-only operations and game/fullscreen capture scenarios.

## Technical Context

| Aspect | Current Decision | Notes |
|--------|------------------|-------|
| Language | C# 12+ | Per Constitution XIII |
| Framework | .NET 8.0 LTS | Per Constitution Technology Stack |
| Key Dependencies | MCP SDK (official C#), Polly, Serilog, Microsoft.Extensions.Logging | All OSS per Constitution XXII |
| Integration Points | Windows SendInput API, UI Automation (elevation detection), DWM APIs | P/Invoke required |
| Constraints | Windows 11 only, Per-Monitor V2 DPI, standard integrity (no admin) | Per Constitution IV, XVIII |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First Development | PASS | Integration tests primary; unit tests for coordinate math only |
| II. Latest Libraries Policy | PASS | Will use latest stable NuGet packages |
| III. MCP Protocol Compliance | PASS | Single `mouse_control` tool with action parameter |
| IV. Windows 11 Target | PASS | Windows 11 only, Per-Monitor V2 DPI declared in manifest |
| V. Dual Packaging | N/A | Core logic shared; transport isolated (future phase) |
| VI. Augmentation Not Duplication | PASS | Raw actuator—no vision/OCR; returns data for LLM interpretation |
| VII. Windows API Docs First | PASS | research.md cites MS Docs for SendInput, coordinate normalization, UIPI |
| VIII. Security Best Practices | PASS | All warnings as errors, analyzers enabled, input validation required |
| IX. Resilient Error Handling | PASS | Meaningful errors, partial success reporting, Polly retries (non-destructive) |
| X. Thread-Safe Interaction | PASS | Mutex serialization for concurrent requests; no STA needed for SendInput |
| XI. Observability | PASS | Structured JSON to stderr, correlation IDs, tool invocation logging |
| XII. Graceful Lifecycle | PASS | SafeHandle for native handles, cancellation token honored |
| XIII. Modern .NET & C# | PASS | Records, primary constructors, nullable enabled, async all the way |
| XIV. xUnit Testing | PASS | xUnit 2.6+ with native assertions, IClassFixture, TheoryData, Bogus |
| XV. Input Simulation | PASS | SendInput only, normalized coordinates, modifier key tracking |
| XVI. Timing & Synchronization | PASS | GetDoubleClickTime(), no fixed sleeps, state verification |
| XVII. Coordinate Systems & DPI | PASS | Per-Monitor V2 manifest, normalized coordinates, multi-monitor math |
| XVIII. Elevated Process Handling | PASS | UIPI detection via WindowFromPoint → OpenProcessToken → TokenElevationType |
| XIX. Accessibility | N/A | Mouse operations; no UI tree walking |
| XX. Window Activation | N/A | Mouse tool does not manage focus (click target receives focus naturally) |
| XXI. Modern CLI Architecture | PASS | Host.CreateApplicationBuilder, IServiceCollection, IConfiguration |
| XXII. Open Source Dependencies | PASS | All dependencies OSS (MIT/Apache); no commercial libraries |

### Gate Evaluation

- [x] All principles PASS or N/A
- [x] No violations requiring justification
- [x] Risk assessment: UIPI detection adds complexity but is well-documented

## Project Structure

```
specs/001-mouse-control/
├── spec.md            # Feature specification (input)
├── plan.md            # This implementation plan
├── research.md        # Phase 0: Windows API research
├── data-model.md      # Phase 1: Entity definitions
├── contracts/         # Phase 1: MCP tool schema
│   └── mouse_control.json
├── quickstart.md      # Phase 1: Developer onboarding
├── tasks.md           # Phase 2: Task breakdown
└── checklists/        # Verification checklists (/speckit.checklist command)
    ├── requirements.md          # Core requirements checklist
    └── requirements-quality.md  # Requirements quality self-review

src/
├── Sbroenne.WindowsMcp/
│   ├── Tools/
│   │   └── MouseControlTool.cs       # MCP tool implementation
│   ├── Input/
│   │   ├── MouseInputService.cs      # SendInput abstraction
│   │   ├── CoordinateNormalizer.cs   # Screen→normalized conversion
│   │   └── ModifierKeyManager.cs     # Ctrl/Shift/Alt state management
│   ├── Automation/
│   │   ├── ElevationDetector.cs      # UIPI/elevation checking
│   │   └── SecureDesktopDetector.cs  # UAC/lock screen detection
│   └── Models/
│       ├── MouseAction.cs            # Action enum
│       ├── MouseControlRequest.cs    # Input model
│       └── MouseControlResult.cs     # Output model

tests/
├── Sbroenne.WindowsMcp.Tests/
│   ├── Integration/
│   │   ├── MouseMoveTests.cs
│   │   ├── MouseClickTests.cs
│   │   ├── MouseDragTests.cs
│   │   ├── MouseScrollTests.cs
│   │   ├── ModifierKeyTests.cs
│   │   ├── ElevationDetectionTests.cs
│   │   ├── MultiMonitorTests.cs
│   │   └── DpiAwarenessTests.cs
│   └── Unit/
│       └── CoordinateNormalizerTests.cs
```

## Complexity Tracking

| Metric | Count |
|--------|-------|
| New entities | 7 (MouseAction, Coordinates, MouseButton, ScrollDirection, ModifierKey, MouseControlResult, MouseControlErrorCode) |
| MCP tools | 1 (mouse_control with 7 actions) |
| External integrations | 0 |
| Windows APIs | 8+ (SendInput, GetCursorPos, SetCursorPos, GetDoubleClickTime, WindowFromPoint, GetWindowThreadProcessId, OpenProcessToken, GetTokenInformation, GetSystemMetrics, etc.) |
| Estimated story points | 13 |

---

## Phase 0: Outline & Research

### Prerequisites
- [x] Spec complete and approved
- [x] Constitution reviewed (v2.1.0)

### Research Tasks

| ID | Topic | Status | Output |
|----|-------|--------|--------|
| R1 | SendInput API for mouse operations | ✅ Complete | → research.md §1 |
| R2 | Coordinate normalization (0-65535) | ✅ Complete | → research.md §2 |
| R3 | Multi-monitor coordinate handling | ✅ Complete | → research.md §3 |
| R4 | Per-Monitor V2 DPI awareness | ✅ Complete | → research.md §4 |
| R5 | UIPI/elevation detection patterns | ✅ Complete | → research.md §5 |
| R6 | Double-click timing via GetDoubleClickTime | ✅ Complete | → research.md §6 |
| R7 | Modifier key state management | ✅ Complete | → research.md §7 |
| R8 | Mouse wheel scrolling (horizontal & vertical) | ✅ Complete | → research.md §8 |
| R9 | Error handling for SendInput failures | ✅ Complete | → research.md §9 |
| R10 | MCP SDK tool implementation patterns | ✅ Complete | → research.md §10 |
| R11 | Secure desktop detection (UAC/lock screen) | ✅ Complete | → research.md §11 |

### Deliverables
- [x] `research.md` — All "NEEDS CLARIFICATION" items resolved

---

## Phase 1: Design & Contracts

### Prerequisites
- [x] `research.md` complete

### Design Tasks

| ID | Artifact | Depends On | Status |
|----|----------|------------|--------|
| D1 | Entity extraction → data-model.md | R1-R11 | ✅ Complete |
| D2 | MCP tool schema → contracts/mouse_control.json | D1 | ✅ Complete |
| D3 | Developer quickstart → quickstart.md | D1, D2 | ✅ Complete |

### Deliverables
- [x] `data-model.md` — Entity definitions, relationships, validation rules
- [x] `contracts/mouse_control.json` — MCP tool JSON schema
- [x] `quickstart.md` — Developer onboarding document

### Agent Context Update
- [x] Technologies documented in plan (no new stack additions beyond constitution)

---

## Phase 2: Task Generation

### Prerequisites
- [x] Phase 1 complete
- [x] All designs validated

### Task Planning

| Story | Tasks | Parallel Eligible | Dependencies |
|-------|-------|-------------------|--------------|
| US-1 Move Cursor | 10 | 5 (50%) | Foundation |
| US-2 Left Click | 12 | 6 (50%) | US-1 |
| US-3 Double Click | 6 | 3 (50%) | US-2 |
| US-4 Right Click | 5 | 2 (40%) | US-2 |
| US-5 Middle Click | 5 | 2 (40%) | US-2 |
| US-6 Modifier Keys | 11 | 6 (55%) | US-2 |
| US-7 Drag | 8 | 4 (50%) | US-1, US-2 |
| US-8 Scroll | 10 | 6 (60%) | US-1 |
| Cross-cutting | 50 | 18 (36%) | Various |

**Totals**: 117 tasks, 52 parallel-eligible (44%)

### Deliverables
- [x] `tasks.md` — Full task breakdown with estimates (117 tasks)

---

## Constitution Check (Post-Design)

Re-evaluated after design completion:

| Principle | Status | Notes |
|-----------|--------|-------|
| XIV. xUnit Testing | PASS | 46 integration tests + 1 unit test planned; native assertions, TheoryData |
| XV. Input Simulation | PASS | SendInput patterns confirmed in research.md; modifier tracking designed |
| XVII. Coordinate Systems | PASS | Normalization formula verified; multi-monitor math documented |
| XVIII. Elevated Process | PASS | Full UIPI detection flow designed with WindowFromPoint approach |
| XXII. Open Source Only | PASS | All dependencies verified as OSS (MIT/Apache 2.0) |

---

## Next Steps

Plan complete. Ready for implementation:
1. ~~Execute Phase 0 research tasks~~ ✅ Complete
2. ~~Complete Phase 1 design artifacts~~ ✅ Complete
3. ~~Generate Phase 2 task breakdown~~ ✅ Complete
4. Begin implementation via `/speckit.implement`
