````markdown
# Tasks: All Monitors Screenshot Capture

**Input**: Design documents from `/specs/008-all-monitors-screenshot/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Source**: `src/Sbroenne.WindowsMcp/`
- **Tests**: `tests/Sbroenne.WindowsMcp.Tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the new enum value that all other changes depend on

- [X] T001 Add `AllMonitors = 4` enum value to src/Sbroenne.WindowsMcp/Models/CaptureTarget.cs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service method that user stories depend on

**⚠️ CRITICAL**: This must be complete before User Story 1 can be tested

- [X] T002 Add `CaptureAllMonitorsAsync` method to src/Sbroenne.WindowsMcp/Capture/ScreenshotService.cs using `CoordinateNormalizer.GetVirtualScreenBounds()` and `CaptureRegionInternalAsync`
- [X] T003 Add `CaptureTarget.AllMonitors` case to the route switch in `ScreenshotService.ExecuteAsync` method

**Checkpoint**: Service layer ready - tool and tests can now proceed

---

## Phase 3: User Story 1 - Capture All Monitors (Priority: P1) 🎯 MVP

**Goal**: Enable LLM agents to capture all monitors with `target="all_monitors"`

**Independent Test**: On a multi-monitor system, invoke capture with `target="all_monitors"`, verify returned image dimensions match the combined virtual screen size.

### Implementation for User Story 1

- [X] T004 [US1] Update `ParseTarget` method in src/Sbroenne.WindowsMcp/Tools/ScreenshotControlTool.cs to map `"all_monitors"` string to `CaptureTarget.AllMonitors`
- [X] T005 [US1] Update tool description in src/Sbroenne.WindowsMcp/Tools/ScreenshotControlTool.cs to include `'all_monitors'` in valid target values
- [X] T006 [US1] Create integration test file tests/Sbroenne.WindowsMcp.Tests/Integration/ScreenshotAllMonitorsTests.cs with test class using `[Collection("WindowsDesktop")]`
- [X] T007 [US1] Add test: `CaptureAllMonitors_ReturnsVirtualScreenDimensions` - verify image width/height match virtual screen bounds
- [X] T008 [P] [US1] Add test: `CaptureAllMonitors_WithCursor_IncludesCursor` - verify `includeCursor=true` works
- [X] T009 [P] [US1] Add test: `CaptureAllMonitors_SingleMonitor_SameAsPrimaryScreen` - verify single-monitor fallback

**Checkpoint**: User Story 1 complete - agents can capture all monitors in a single screenshot

---

## Phase 4: User Story 2 - Integration Test Verification (Priority: P1)

**Goal**: Enable before/after screenshot comparison to verify test actions on correct monitor

**Independent Test**: Run a mouse click test targeting secondary monitor, capture all monitors before/after, verify click effect appears only on secondary.

### Implementation for User Story 2

- [X] T010 [US2] Add test: `CaptureAllMonitors_BeforeAfterComparison_DetectsChange` - verify screenshot differences can be detected
- [X] T011 [US2] Update quickstart.md with before/after verification pattern example code

**Checkpoint**: User Story 2 complete - test verification pattern documented and tested

---

## Phase 5: User Story 3 - Virtual Screen Information (Priority: P2)

**Goal**: Extend `list_monitors` to include virtual screen bounds

**Independent Test**: Invoke `list_monitors`, verify response includes `virtualScreen` bounds (x, y, width, height).

### Implementation for User Story 3

- [X] T012 [US3] Add `VirtualScreenInfo` record to src/Sbroenne.WindowsMcp/Models/ directory (or add to existing ScreenshotModels.cs)
- [X] T013 [US3] Update `ScreenshotControlResult` class to include optional `VirtualScreen` property
- [X] T014 [US3] Update `HandleListMonitors` method in src/Sbroenne.WindowsMcp/Capture/ScreenshotService.cs to populate `VirtualScreen` using `CoordinateNormalizer.GetVirtualScreenBounds()`
- [X] T015 [US3] Add test: `ListMonitors_IncludesVirtualScreenBounds` - verify virtualScreen property in response

**Checkpoint**: User Story 3 complete - agents can query combined screen layout

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and validation

- [X] T016 [P] Update README.md or tool documentation if external docs exist
- [X] T017 Run all screenshot tests to verify no regressions: `dotnet test --filter "FullyQualifiedName~Screenshot"`
- [X] T018 Run quickstart.md validation scenarios manually on multi-monitor system
- [X] T019 [P] Update .github/agents/copilot-instructions.md with 008-all-monitors-screenshot feature summary

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (enum must exist first)
- **User Stories (Phases 3-5)**: All depend on Phase 2 completion
  - US1 and US3 can proceed in parallel (different code paths)
  - US2 depends on US1 being functional
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - Core capture functionality
- **User Story 2 (P1)**: Depends on User Story 1 - Verification pattern uses US1's capture
- **User Story 3 (P2)**: Depends on Foundational (Phase 2) - Independent of US1/US2

### Within Each Phase

- T001 must complete before T002-T003
- T002 must complete before T003 (method needed for routing)
- T004-T005 can run in parallel (same file but different sections)
- T006 must complete before T007-T009 (test file must exist)
- T007-T009 can run in parallel (independent test methods)
- T012 must complete before T013-T014 (type needed)

### Parallel Opportunities

Within User Story 1 tests:
- T008 [CaptureAllMonitors_WithCursor_IncludesCursor] can run parallel with T007
- T009 [CaptureAllMonitors_SingleMonitor_SameAsPrimaryScreen] can run parallel with T007

Across User Stories:
- US1 tests (T006-T009) can start immediately after Foundational
- US3 implementation (T012-T014) can start immediately after Foundational
- US2 (T010-T011) waits for US1 completion

---

## Parallel Example: User Story 1 Tests

```bash
# After T006 (test file creation), launch tests in parallel:
Task: T007 "Add test: CaptureAllMonitors_ReturnsVirtualScreenDimensions"
Task: T008 "Add test: CaptureAllMonitors_WithCursor_IncludesCursor" [P]
Task: T009 "Add test: CaptureAllMonitors_SingleMonitor_SameAsPrimaryScreen" [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001) - 5 min
2. Complete Phase 2: Foundational (T002-T003) - 15 min
3. Complete Phase 3: User Story 1 (T004-T009) - 30 min
4. **STOP and VALIDATE**: Test `target="all_monitors"` on multi-monitor system
5. Deploy/demo if ready

### Estimated Time

| Phase | Tasks | Time |
|-------|-------|------|
| Setup | T001 | 5 min |
| Foundational | T002-T003 | 15 min |
| User Story 1 | T004-T009 | 30 min |
| User Story 2 | T010-T011 | 15 min |
| User Story 3 | T012-T015 | 20 min |
| Polish | T016-T019 | 15 min |
| **Total** | **19 tasks** | **~2 hours** |

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready (~20 min)
2. Add User Story 1 → Test → Deploy (MVP! ~50 min total)
3. Add User Story 3 → Virtual screen info available (~70 min total)
4. Add User Story 2 → Full test verification pattern (~85 min total)
5. Polish → Complete feature (~100 min total)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Key existing code reused:
  - `CoordinateNormalizer.GetVirtualScreenBounds()` - already returns virtual screen dimensions
  - `CaptureRegionInternalAsync()` - handles all capture logic including negative coordinates
- Minimal code change: ~20 lines of new code, ~10 lines of updates
- Test on multi-monitor system for proper validation

````
