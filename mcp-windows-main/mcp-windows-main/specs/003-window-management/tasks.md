# Tasks: Window Management

**Input**: Design documents from `/specs/003-window-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, models, and native interop extensions

- [x] T001 [P] Create WindowAction enum in src/Sbroenne.WindowsMcp/Models/WindowAction.cs
- [x] T002 [P] Create WindowState enum in src/Sbroenne.WindowsMcp/Models/WindowState.cs
- [x] T003 [P] Create WindowBounds record in src/Sbroenne.WindowsMcp/Models/WindowBounds.cs
- [x] T004 [P] Create WindowInfo record in src/Sbroenne.WindowsMcp/Models/WindowInfo.cs
- [x] T005 [P] Create WindowManagementRequest record in src/Sbroenne.WindowsMcp/Models/WindowManagementRequest.cs
- [x] T006 [P] Create WindowManagementResult record in src/Sbroenne.WindowsMcp/Models/WindowManagementResult.cs
- [x] T007 [P] Create WindowManagementErrorCode enum in src/Sbroenne.WindowsMcp/Models/WindowManagementErrorCode.cs
- [x] T008 [P] Create WindowConfiguration record in src/Sbroenne.WindowsMcp/Configuration/WindowConfiguration.cs

---

## Phase 2: Foundational (Native Interop & Core Services)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Native Interop Extensions

- [x] T009 Add EnumWindows, EnumWindowsProc to NativeMethods.cs in src/Sbroenne.WindowsMcp/Native/NativeMethods.cs
- [x] T010 [P] Add GetWindowText, GetClassName, IsWindowVisible to NativeMethods.cs
- [x] T011 [P] Add GetWindowRect, GetWindowPlacement to NativeMethods.cs
- [x] T012 [P] Add DwmGetWindowAttribute for DWMWA_EXTENDED_FRAME_BOUNDS and DWMWA_CLOAKED to NativeMethods.cs
- [x] T013 [P] Add SetForegroundWindow, GetForegroundWindow, AllowSetForegroundWindow to NativeMethods.cs
- [x] T014 [P] Add AttachThreadInput, ShowWindow to NativeMethods.cs
- [x] T015 [P] Add SetWindowPos, MoveWindow to NativeMethods.cs
- [x] T016 [P] Add PostMessage for WM_CLOSE to NativeMethods.cs
- [x] T017 [P] Add MonitorFromWindow, GetMonitorInfo to NativeMethods.cs
- [x] T018 [P] Add SendMessageTimeout for hung window detection to NativeMethods.cs
- [x] T019 [P] Add IsIconic, IsZoomed to NativeMethods.cs
- [x] T020 [P] Add window constants (SW_*, SWP_*, DWMWA_*, WM_*, SMTO_*) to NativeConstants.cs
- [x] T021 [P] Add RECT, WINDOWPLACEMENT, MONITORINFO structs to NativeStructs.cs

### COM Interface for Virtual Desktops

- [x] T022 Create IVirtualDesktopManager COM interface in src/Sbroenne.WindowsMcp/Native/IVirtualDesktopManager.cs

### Window Service Infrastructure

- [x] T023 Create IWindowEnumerator interface in src/Sbroenne.WindowsMcp/Window/IWindowEnumerator.cs
- [x] T024 Create WindowEnumerator implementation in src/Sbroenne.WindowsMcp/Window/WindowEnumerator.cs (EnumWindows wrapper with filtering)
- [x] T025 Create IWindowActivator interface in src/Sbroenne.WindowsMcp/Window/IWindowActivator.cs
- [x] T026 Create WindowActivator implementation in src/Sbroenne.WindowsMcp/Window/WindowActivator.cs (multi-strategy activation)
- [x] T027 Create IWindowService interface in src/Sbroenne.WindowsMcp/Window/IWindowService.cs
- [x] T028 Create WindowService implementation in src/Sbroenne.WindowsMcp/Window/WindowService.cs (orchestrates operations)
- [x] T029 Create WindowOperationLogger in src/Sbroenne.WindowsMcp/Logging/WindowOperationLogger.cs

### Unit Tests for Core Components

- [x] T030 [P] Create WindowConfigurationTests in tests/Sbroenne.WindowsMcp.Tests/Unit/WindowConfigurationTests.cs

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - List Open Windows (Priority: P1) 🎯 MVP

**Goal**: Enumerate all visible top-level windows with titles, process info, and bounds

**Independent Test**: Open several applications, invoke list action, verify all visible windows returned with correct data

### Integration Tests for User Story 1

- [x] T031 [P] [US1] Create WindowListTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowListTests.cs
  - Test: List returns multiple windows when apps are open
  - Test: List includes window titles, handles, process names
  - Test: List includes bounds with valid coordinates
  - Test: List includes minimized windows with state flag
  - Test: List with filter returns only matching windows
  - Test: List excludes cloaked windows by default
  - Test: List with include_all_desktops includes cloaked windows
  - Test: Multi-monitor windows have correct monitor_index

### Implementation for User Story 1

- [x] T032 [US1] Implement window enumeration in WindowEnumerator.EnumerateWindows() in src/Sbroenne.WindowsMcp/Window/WindowEnumerator.cs
- [x] T033 [US1] Implement window info population (title, class, process, bounds, state) in WindowEnumerator
- [x] T034 [US1] Implement cloaking detection in WindowEnumerator using DwmGetWindowAttribute(DWMWA_CLOAKED)
- [x] T035 [US1] Implement virtual desktop detection in WindowEnumerator using IVirtualDesktopManager
- [x] T036 [US1] Implement UWP detection in WindowEnumerator (ApplicationFrameHost process check)
- [x] T037 [US1] Implement hung window detection in WindowEnumerator using SendMessageTimeout
- [x] T038 [US1] Implement elevation detection in WindowEnumerator (reuse existing ElevationDetector)
- [x] T039 [US1] Implement monitor detection in WindowEnumerator using MonitorFromWindow
- [x] T040 [US1] Implement filter support in WindowService.ListWindowsAsync (title/process substring match)
- [x] T041 [US1] Add list action handling in WindowManagementTool.cs in src/Sbroenne.WindowsMcp/Tools/WindowManagementTool.cs

**Checkpoint**: List action fully functional - verify with integration tests

---

## Phase 4: User Story 2 - Find Window by Title (Priority: P1)

**Goal**: Locate specific windows by title (substring or regex)

**Independent Test**: Open Notepad, find by title, verify correct handle and position returned

### Integration Tests for User Story 2

- [x] T042 [P] [US2] Create WindowFindTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowFindTests.cs
  - Test: Find by exact title returns window
  - Test: Find by substring returns matching windows
  - Test: Find is case-insensitive by default
  - Test: Find with regex=true uses regex matching
  - Test: Find with no match returns empty result (not error)
  - Test: Find with invalid regex returns error

### Implementation for User Story 2

- [x] T043 [US2] Implement title matching in WindowService.FindWindowAsync (substring, case-insensitive)
- [x] T044 [US2] Implement regex matching in WindowService.FindWindowAsync when regex=true
- [x] T045 [US2] Add find action handling in WindowManagementTool.cs

**Checkpoint**: Find action fully functional - verify with integration tests

---

## Phase 5: User Story 3 - Activate/Focus Window (Priority: P1)

**Goal**: Bring window to foreground and give it keyboard focus

**Independent Test**: Open two windows, activate background one, verify it comes to foreground

### Integration Tests for User Story 3

- [x] T046 [P] [US3] Create WindowActivateTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowActivateTests.cs
  - Test: Activate brings background window to foreground
  - Test: Activate restores minimized window and activates it
  - Test: Activate returns window info with is_foreground=true
  - Test: Activate elevated window returns ElevatedWindowActive error
  - Test: Activate invalid handle returns HandleInvalid error

### Implementation for User Story 3

- [x] T047 [US3] Implement SetForegroundWindow strategy in WindowActivator
- [x] T048 [US3] Implement Alt-key trick fallback strategy in WindowActivator
- [x] T049 [US3] Implement AttachThreadInput fallback strategy in WindowActivator (with caution flag)
- [x] T050 [US3] Implement minimize-restore fallback strategy in WindowActivator
- [x] T051 [US3] Implement activation verification in WindowActivator (confirm foreground)
- [x] T052 [US3] Implement WindowService.ActivateWindowAsync with retry logic
- [x] T053 [US3] Add activate action handling in WindowManagementTool.cs

**Checkpoint**: Activate action fully functional - verify with integration tests

---

## Phase 6: User Story 4 - Get Foreground Window Info (Priority: P1)

**Goal**: Report which window currently has focus

**Independent Test**: Focus different windows, verify tool reports correct window each time

### Integration Tests for User Story 4

- [x] T054 [P] [US4] Add get_foreground tests to WindowActivateTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowActivateTests.cs
  - Test: GetForeground returns current foreground window info
  - Test: GetForeground returns desktop/shell when no window focused
  - Test: GetForeground detects secure desktop active (if possible to test)

### Implementation for User Story 4

- [x] T055 [US4] Implement WindowService.GetForegroundWindowAsync using GetForegroundWindow
- [x] T056 [US4] Implement secure desktop detection in WindowService (reuse SecureDesktopDetector)
- [x] T057 [US4] Add get_foreground action handling in WindowManagementTool.cs

**Checkpoint**: Get foreground action fully functional

---

## Phase 7: User Story 5 - Control Window State (Priority: P2)

**Goal**: Minimize, maximize, restore, and close windows

**Independent Test**: Maximize a window, verify it fills screen; minimize, verify it's on taskbar

### Integration Tests for User Story 5

- [x] T058 [P] [US5] Create WindowStateTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowStateTests.cs
  - Test: Minimize moves window to taskbar (IsIconic true)
  - Test: Maximize fills screen (IsZoomed true)
  - Test: Restore returns window to normal size
  - Test: Close sends WM_CLOSE (window may prompt for save)
  - Test: State change on invalid handle returns error

### Implementation for User Story 5

- [x] T059 [US5] Implement WindowService.MinimizeWindowAsync using ShowWindow(SW_MINIMIZE)
- [x] T060 [US5] Implement WindowService.MaximizeWindowAsync using ShowWindow(SW_MAXIMIZE)
- [x] T061 [US5] Implement WindowService.RestoreWindowAsync using ShowWindow(SW_RESTORE)
- [x] T062 [US5] Implement WindowService.CloseWindowAsync using PostMessage(WM_CLOSE)
- [x] T063 [US5] Add minimize, maximize, restore, close action handling in WindowManagementTool.cs

**Checkpoint**: Window state control fully functional

---

## Phase 8: User Story 6 - Move and Resize Window (Priority: P2)

**Goal**: Position and size windows to specified coordinates

**Independent Test**: Move window to (100, 100), verify new position; resize to 800x600, verify new size

### Integration Tests for User Story 6

- [x] T064 [P] [US6] Create WindowMoveResizeTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowMoveResizeTests.cs
  - Test: Move repositions window to specified coordinates
  - Test: Resize changes window dimensions
  - Test: SetBounds changes position and size atomically
  - Test: Off-screen coordinates warn but succeed
  - Test: Invalid dimensions return error

### Implementation for User Story 6

- [x] T065 [US6] Implement WindowService.MoveWindowAsync using SetWindowPos with SWP_NOSIZE
- [x] T066 [US6] Implement WindowService.ResizeWindowAsync using SetWindowPos with SWP_NOMOVE
- [x] T067 [US6] Implement WindowService.SetBoundsAsync using SetWindowPos for atomic move+resize
- [x] T068 [US6] Add move, resize, set_bounds action handling in WindowManagementTool.cs

**Checkpoint**: Window positioning fully functional

---

## Phase 9: User Story 7 - Wait for Window (Priority: P2)

**Goal**: Wait for window to appear with configurable timeout

**Independent Test**: Start an application, wait_for its window, verify it returns when window appears

### Integration Tests for User Story 7

- [x] T069 [P] [US7] Create WindowWaitTests in tests/Sbroenne.WindowsMcp.Tests/Integration/WindowWaitTests.cs
  - Test: WaitFor returns immediately if window already exists
  - Test: WaitFor blocks until window appears
  - Test: WaitFor times out and returns error after timeout_ms
  - Test: WaitFor with regex matches by pattern

### Implementation for User Story 7

- [x] T070 [US7] Implement WindowService.WaitForWindowAsync with polling loop
- [x] T071 [US7] Implement timeout handling with configurable timeout_ms
- [x] T072 [US7] Add wait_for action handling in WindowManagementTool.cs

**Checkpoint**: Wait for window fully functional

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, validation, and cleanup

- [x] T073 Register WindowService, WindowEnumerator, WindowActivator in DI in src/Sbroenne.WindowsMcp/Program.cs
- [x] T074 Register WindowManagementTool as MCP tool in src/Sbroenne.WindowsMcp/Program.cs
- [x] T075 [P] Add input validation for all request parameters in WindowManagementTool.cs
- [x] T076 [P] Add structured logging for all operations in WindowOperationLogger
- [x] T077 Run all integration tests and fix any failures
- [ ] T078 Run quickstart.md validation (manual test of all examples)
- [x] T079 Update README.md with window_management tool documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - models and enums only
- **Phase 2 (Foundational)**: Depends on Phase 1 - native interop and services
- **Phases 3-9 (User Stories)**: All depend on Phase 2 completion
- **Phase 10 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (List)**: Foundation only - no story dependencies 🎯 MVP
- **US2 (Find)**: Uses US1 enumeration logic internally
- **US3 (Activate)**: Foundation only - parallel with US1
- **US4 (GetForeground)**: Foundation only - parallel with US1
- **US5 (State Control)**: Foundation only - parallel with US1
- **US6 (Move/Resize)**: Foundation only - parallel with US1
- **US7 (Wait)**: Uses US1/US2 find logic internally

### Parallel Opportunities by Phase

**Phase 1 (All Parallel)**:
```bash
T001, T002, T003, T004, T005, T006, T007, T008
```

**Phase 2 Native Interop (Parallel after T009)**:
```bash
T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022
```

**Phase 2 Services (Sequential)**:
```bash
T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030
```

**Phases 3-9 (User Stories can be parallel with team)**:
```bash
# Developer A: US1 (List) - T031..T041
# Developer B: US3 (Activate) - T046..T053
# Developer C: US5 (State) - T058..T063
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | T001-T008 | Models, enums, configuration |
| 2 | T009-T030 | Native interop, core services |
| 3 | T031-T041 | US1: List Windows (P1) 🎯 MVP |
| 4 | T042-T045 | US2: Find Window (P1) |
| 5 | T046-T053 | US3: Activate Window (P1) |
| 6 | T054-T057 | US4: Get Foreground (P1) |
| 7 | T058-T063 | US5: Window State (P2) |
| 8 | T064-T068 | US6: Move/Resize (P2) |
| 9 | T069-T072 | US7: Wait for Window (P2) |
| 10 | T073-T079 | Polish & integration |

**Total Tasks**: 79
