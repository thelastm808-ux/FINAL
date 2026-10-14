# Tasks: Mouse Control

**Input**: Design documents from `/specs/001-mouse-control/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create project structure and configure build environment

- [X] T001 Create solution and project structure per plan.md in src/Sbroenne.WindowsMcp/
- [X] T002 [P] Add NuGet package references (MCP SDK, Polly, Serilog, Microsoft.Extensions.Logging)
- [X] T003 [P] Create app.manifest with Per-Monitor V2 DPI awareness declaration
- [X] T004 [P] Configure .csproj with TreatWarningsAsErrors, nullable enabled, analyzers
- [X] T005 [P] Create tests/Sbroenne.WindowsMcp.Tests/ project with xUnit references
- [X] T006 [P] Add Bogus and NSubstitute test dependencies

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### P/Invoke Declarations

- [X] T007 [P] Create src/Sbroenne.WindowsMcp/Native/NativeMethods.cs with SendInput P/Invoke
- [X] T008 [P] Create src/Sbroenne.WindowsMcp/Native/NativeStructs.cs with INPUT, MOUSEINPUT, KEYBDINPUT structures
- [X] T009 [P] Create src/Sbroenne.WindowsMcp/Native/NativeConstants.cs with MOUSEEVENTF_*, VK_*, SM_* constants
- [X] T010 [P] Add GetSystemMetrics, GetCursorPos, SetCursorPos P/Invoke declarations to NativeMethods.cs
- [X] T011 [P] Add WindowFromPoint, GetWindowThreadProcessId, GetWindowText P/Invoke to NativeMethods.cs
- [X] T012 [P] Add OpenProcessToken, GetTokenInformation, CloseHandle P/Invoke to NativeMethods.cs
- [X] T013 [P] Add OpenInputDesktop, CloseDesktop P/Invoke to NativeMethods.cs

### Core Models

- [X] T014 [P] Create src/Sbroenne.WindowsMcp/Models/MouseAction.cs enum
- [X] T015 [P] Create src/Sbroenne.WindowsMcp/Models/MouseButton.cs enum
- [X] T016 [P] Create src/Sbroenne.WindowsMcp/Models/ScrollDirection.cs enum
- [X] T017 [P] Create src/Sbroenne.WindowsMcp/Models/ModifierKey.cs flags enum
- [X] T018 [P] Create src/Sbroenne.WindowsMcp/Models/Coordinates.cs value object
- [X] T019 [P] Create src/Sbroenne.WindowsMcp/Models/ScreenBounds.cs value object
- [X] T020 [P] Create src/Sbroenne.WindowsMcp/Models/MouseControlErrorCode.cs enum
- [X] T021 Create src/Sbroenne.WindowsMcp/Models/MouseControlRequest.cs input model with validation
- [X] T022 Create src/Sbroenne.WindowsMcp/Models/MouseControlResult.cs output model

### Core Services

- [X] T023 Create src/Sbroenne.WindowsMcp/Input/IMouseInputService.cs interface
- [X] T024 Create src/Sbroenne.WindowsMcp/Input/CoordinateNormalizer.cs with multi-monitor normalization formula
- [X] T025 Create tests/Sbroenne.WindowsMcp.Tests/Unit/CoordinateNormalizerTests.cs with TheoryData for edge cases
- [X] T026 Create src/Sbroenne.WindowsMcp/Automation/IElevationDetector.cs interface
- [X] T027 Create src/Sbroenne.WindowsMcp/Automation/ElevationDetector.cs with UIPI detection logic
- [X] T028 Create src/Sbroenne.WindowsMcp/Automation/ISecureDesktopDetector.cs interface
- [X] T029 Create src/Sbroenne.WindowsMcp/Automation/SecureDesktopDetector.cs with OpenInputDesktop logic
- [X] T030 Create src/Sbroenne.WindowsMcp/Input/IModifierKeyManager.cs interface
- [X] T031 Create src/Sbroenne.WindowsMcp/Input/ModifierKeyManager.cs with press/release tracking

### Infrastructure

- [X] T032 Create src/Sbroenne.WindowsMcp/Services/MouseOperationLock.cs with SemaphoreSlim(1,1) for serialization
- [X] T033 [P] Configure Serilog for structured JSON logging to stderr
- [X] T034 [P] Create src/Sbroenne.WindowsMcp/Logging/MouseOperationLogger.cs with correlation ID support

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Move Cursor to Coordinates (Priority: P1) 🎯 MVP

**Goal**: Position the mouse cursor at specific screen coordinates with DPI and multi-monitor support

**Independent Test**: Invoke tool with coordinates and verify cursor arrives at expected position

### Tests for User Story 1

- [X] T035 [P] [US1] Create tests/Sbroenne.WindowsMcp.Tests/Integration/MouseMoveTests.cs test class
- [X] T036 [US1] Implement test: Move to valid coordinates returns success with final position
- [X] T037 [US1] Implement test: Move to negative coordinates (secondary monitor) works correctly
- [X] T038 [US1] Implement test: Move to out-of-bounds coordinates returns CoordinatesOutOfBounds error with valid bounds
- [X] T039 [US1] Implement test: Final position matches requested coordinates within 1 pixel

### Implementation for User Story 1

- [X] T040 [US1] Implement MouseInputService.MoveAsync() in src/Sbroenne.WindowsMcp/Input/MouseInputService.cs
- [X] T041 [US1] Add screen bounds validation to MouseInputService using GetSystemMetrics
- [X] T042 [US1] Create src/Sbroenne.WindowsMcp/Tools/MouseControlTool.cs MCP tool class with move action
- [X] T043 [US1] Register MouseControlTool with MCP SDK
- [X] T044 [US1] Add structured logging for move operations with coordinates and outcome

**Checkpoint**: User Story 1 complete - cursor movement works independently

---

## Phase 4: User Story 2 - Left Click (Priority: P1)

**Goal**: Perform left mouse button clicks at cursor position or specified coordinates

**Independent Test**: Click on a test button and verify the click event occurred

### Tests for User Story 2

- [X] T045 [P] [US2] Create tests/Sbroenne.WindowsMcp.Tests/Integration/MouseClickTests.cs test class
- [X] T046 [US2] Implement test: Click at current position returns success
- [X] T047 [US2] Implement test: Click with coordinates moves cursor then clicks
- [X] T048 [US2] Implement test: Click on elevated window returns ElevatedProcessTarget error
- [X] T049 [US2] Implement test: Click when secure desktop active returns SecureDesktopActive error
- [X] T050 [US2] Implement test: Success response includes window title under cursor

### Implementation for User Story 2

- [X] T051 [US2] Implement MouseInputService.ClickAsync() with button down/up sequence
- [X] T052 [US2] Add elevation detection check before click in MouseControlTool
- [X] T053 [US2] Add secure desktop detection check before click in MouseControlTool
- [X] T054 [US2] Add window title retrieval using GetWindowText to result
- [X] T055 [US2] Add click action handling to MouseControlTool
- [X] T056 [US2] Add structured logging for click operations

**Checkpoint**: User Story 2 complete - left clicks work independently

---

## Phase 5: User Story 3 - Double Click (Priority: P2)

**Goal**: Perform double-click operations recognized by Windows as valid double-clicks

**Independent Test**: Double-click in a text field and verify word selection

### Tests for User Story 3

- [X] T057 [P] [US3] Implement test: Double-click is recognized as valid double-click (GetDoubleClickTime timing)
- [X] T058 [US3] Implement test: Double-click with coordinates moves cursor first
- [X] T059 [US3] Implement test: Both clicks occur at same position

### Implementation for User Story 3

- [X] T060 [US3] Implement MouseInputService.DoubleClickAsync() with GetDoubleClickTime() inter-click delay
- [X] T061 [US3] Add double_click action handling to MouseControlTool
- [X] T062 [US3] Add structured logging for double-click operations

**Checkpoint**: User Story 3 complete - double-clicks work independently

---

## Phase 6: User Story 4 - Right Click (Priority: P2)

**Goal**: Perform right mouse button clicks to access context menus

**Independent Test**: Right-click on desktop and verify context menu appears

### Tests for User Story 4

- [X] T063 [P] [US4] Implement test: Right-click at current position returns success
- [X] T064 [P] [US4] Implement test: Right-click with coordinates moves cursor first

### Implementation for User Story 4

- [X] T065 [US4] Implement MouseInputService.RightClickAsync() with RIGHTDOWN/RIGHTUP
- [X] T066 [US4] Add right_click action handling to MouseControlTool
- [X] T067 [US4] Add structured logging for right-click operations

**Checkpoint**: User Story 4 complete - right-clicks work independently

---

## Phase 7: User Story 5 - Middle Click (Priority: P3)

**Goal**: Perform middle mouse button clicks for browser tabs or auto-scroll

**Independent Test**: Middle-click a link in browser and verify new tab opens

### Tests for User Story 5

- [X] T068 [P] [US5] Implement test: Middle-click at current position returns success
- [X] T069 [P] [US5] Implement test: Middle-click with coordinates moves cursor first

### Implementation for User Story 5

- [X] T070 [US5] Implement MouseInputService.MiddleClickAsync() with MIDDLEDOWN/MIDDLEUP
- [X] T071 [US5] Add middle_click action handling to MouseControlTool
- [X] T072 [US5] Add structured logging for middle-click operations

**Checkpoint**: User Story 5 complete - middle-clicks work independently

---

## Phase 8: User Story 6 - Click with Modifier Keys (Priority: P2)

**Goal**: Perform clicks while holding Ctrl/Shift/Alt modifier keys

**Independent Test**: Ctrl+click items in a list and verify multi-selection

### Tests for User Story 6

- [X] T073 [P] [US6] Create tests/Sbroenne.WindowsMcp.Tests/Integration/ModifierKeyTests.cs test class
- [X] T074 [US6] Implement test: Ctrl+click sends correct modifier sequence
- [X] T075 [US6] Implement test: Shift+click sends correct modifier sequence
- [X] T076 [US6] Implement test: Multiple modifiers (Ctrl+Shift) work together
- [X] T077 [US6] Implement test: Modifiers are released even on operation failure
- [X] T078 [US6] Implement test: Pre-existing modifier state is preserved (only tool-pressed keys released)

### Implementation for User Story 6

- [X] T079 [US6] Implement ModifierKeyManager.PressModifiersAsync() with GetAsyncKeyState check
- [X] T080 [US6] Implement ModifierKeyManager.ReleaseModifiersAsync() with finally block guarantee
- [X] T081 [US6] Add modifier key handling to click operations in MouseInputService
- [X] T082 [US6] Add modifiers parameter handling to MouseControlTool
- [X] T083 [US6] Add structured logging for modifier key operations

**Checkpoint**: User Story 6 complete - modifier clicks work independently

---

## Phase 9: User Story 7 - Drag Operation (Priority: P2)

**Goal**: Perform drag-and-drop operations for file management and window resizing

**Independent Test**: Drag a file from one folder to another

### Tests for User Story 7

- [X] T084 [P] [US7] Create tests/Sbroenne.WindowsMcp.Tests/Integration/MouseDragTests.cs test class
- [X] T085 [US7] Implement test: Left-button drag from start to end coordinates
- [X] T086 [US7] Implement test: Right-button drag works with button parameter
- [X] T087 [US7] Implement test: Drag releases button even if window closes (partial success)

### Implementation for User Story 7

- [X] T088 [US7] Implement MouseInputService.DragAsync() with move, button-down, move, button-up sequence
- [X] T089 [US7] Add button parameter support for drag (left/right/middle)
- [X] T090 [US7] Add drag action handling to MouseControlTool with required parameters validation
- [X] T091 [US7] Add structured logging for drag operations

**Checkpoint**: User Story 7 complete - drag operations work independently

---

## Phase 10: User Story 8 - Scroll (Priority: P2)

**Goal**: Perform mouse wheel scroll operations for navigation

**Independent Test**: Scroll in a scrollable window and verify content scrolls

### Tests for User Story 8

- [X] T092 [P] [US8] Create tests/Sbroenne.WindowsMcp.Tests/Integration/MouseScrollTests.cs test class
- [X] T093 [US8] Implement test: Scroll down sends correct WHEEL_DELTA
- [X] T094 [US8] Implement test: Scroll up sends positive WHEEL_DELTA (away from user)
- [X] T095 [US8] Implement test: Horizontal scroll uses MOUSEEVENTF_HWHEEL
- [X] T096 [US8] Implement test: Scroll amount multiplies WHEEL_DELTA correctly
- [X] T097 [US8] Implement test: Scroll with coordinates moves cursor first

### Implementation for User Story 8

- [X] T098 [US8] Implement MouseInputService.ScrollAsync() with MOUSEEVENTF_WHEEL/HWHEEL
- [X] T099 [US8] Add direction and amount parameter handling
- [X] T100 [US8] Add scroll action handling to MouseControlTool with direction validation
- [X] T101 [US8] Add structured logging for scroll operations

**Checkpoint**: User Story 8 complete - scroll operations work independently

---

## Phase 11: Cross-Cutting (Multi-Monitor & DPI)

**Purpose**: Verify cross-cutting concerns across all user stories

### Multi-Monitor Tests

- [X] T102 [P] Create tests/Sbroenne.WindowsMcp.Tests/Integration/MultiMonitorTests.cs test class
- [X] T103 Implement test: Operations work correctly with negative coordinates
- [X] T104 Implement test: Coordinate normalization formula handles virtual desktop correctly

### DPI Awareness Tests

- [X] T105 [P] Create tests/Sbroenne.WindowsMcp.Tests/Integration/DpiAwarenessTests.cs test class
- [X] T106 Implement test: Cursor positioning accurate at 100%, 125%, 150%, 200% DPI scales
- [X] T107 Implement test: Per-Monitor V2 manifest correctly applied

### Elevation Detection Tests

- [X] T108 [P] Create tests/Sbroenne.WindowsMcp.Tests/Integration/ElevationDetectionTests.cs test class
- [X] T109 Implement test: Elevation detected before input attempt
- [X] T110 Implement test: Clear error message returned for elevated target

---

## Phase 12: Polish & Hardening

**Purpose**: Final validation and documentation

- [X] T111 [P] Validate all error codes match MouseControlErrorCode enum in contracts
- [X] T112 [P] Verify structured JSON logging format matches FR-016
- [X] T113 [P] Add XML documentation to all public APIs
- [X] T114 Run quickstart.md validation scenarios end-to-end
- [X] T115 Verify timeout configuration via MCP_MOUSE_TIMEOUT_MS environment variable
- [X] T116 [P] Code cleanup and remove any TODO comments
- [X] T117 Final integration test run with all user stories

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ─────────────────────┐
                                    ▼
Phase 2: Foundational ──────────────┤ (BLOCKS all user stories)
                                    ▼
         ┌──────────────────────────┴──────────────────────────┐
         │                     USER STORIES                     │
         │  (can proceed in parallel or sequentially by P#)     │
         │                                                      │
         │  Phase 3: US1 Move (P1) ◄── MVP                     │
         │  Phase 4: US2 Click (P1)                            │
         │  Phase 5: US3 Double-Click (P2)                     │
         │  Phase 6: US4 Right-Click (P2)                      │
         │  Phase 7: US5 Middle-Click (P3)                     │
         │  Phase 8: US6 Modifiers (P2)                        │
         │  Phase 9: US7 Drag (P2)                             │
         │  Phase 10: US8 Scroll (P2)                          │
         └──────────────────────────┬──────────────────────────┘
                                    ▼
Phase 11: Cross-Cutting ────────────┤
                                    ▼
Phase 12: Polish ───────────────────┘
```

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 Move | Foundational | — |
| US2 Click | Foundational | US1 (uses MoveAsync internally) |
| US3 Double-Click | US2 (uses ClickAsync) | US4, US5, US6, US7, US8 |
| US4 Right-Click | US2 (shares click infrastructure) | US3, US5, US6, US7, US8 |
| US5 Middle-Click | US2 (shares click infrastructure) | US3, US4, US6, US7, US8 |
| US6 Modifiers | US2 (wraps click operations) | US3, US4, US5, US7, US8 |
| US7 Drag | US1, US2 (uses move + click) | US3, US4, US5, US6, US8 |
| US8 Scroll | US1 (uses move for positioning) | US3, US4, US5, US6, US7 |

### Within Each User Story

1. Tests FIRST (if included) - should FAIL before implementation
2. Implementation in dependency order
3. Story complete before moving to next priority

### Parallel Opportunities per Phase

| Phase | Parallel Tasks | Sequential Tasks |
|-------|---------------|------------------|
| 1. Setup | T002-T006 (5) | T001 first |
| 2. Foundational | T007-T020, T033-T034 (16) | T021-T032 sequential |
| 3. US1 Move | T035 | T036-T044 |
| 4. US2 Click | T045 | T046-T056 |
| 5. US3 Double-Click | T057 | T058-T062 |
| 6. US4 Right-Click | T063-T064 | T065-T067 |
| 7. US5 Middle-Click | T068-T069 | T070-T072 |
| 8. US6 Modifiers | T073 | T074-T083 |
| 9. US7 Drag | T084 | T085-T091 |
| 10. US8 Scroll | T092 | T093-T101 |
| 11. Cross-Cutting | T102, T105, T108 | T103-T104, T106-T107, T109-T110 |
| 12. Polish | T111-T113, T116 | T114-T115, T117 |

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Move)
4. **STOP and VALIDATE**: Test cursor movement independently
5. Deploy/demo if ready - LLMs can now position cursors!

### Incremental Delivery (Recommended)

1. Setup + Foundational → Foundation ready
2. **US1 Move** → Test → **MVP Ready!**
3. **US2 Click** → Test → Basic automation possible
4. US3-US8 in priority order → Each adds capability
5. Cross-cutting + Polish → Production ready

### Task Totals

| Category | Count |
|----------|-------|
| Setup tasks | 6 |
| Foundational tasks | 28 |
| User Story tasks | 67 |
| Cross-cutting tasks | 9 |
| Polish tasks | 7 |
| **Total** | **117** |

| Metric | Count |
|--------|-------|
| Integration tests | 46 |
| Unit tests | 1 |
| Parallel-eligible tasks | 52 (44%) |

---

## Notes

- **[P]** = Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]** = Maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are written FIRST per Constitution I (Test-First Development)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
