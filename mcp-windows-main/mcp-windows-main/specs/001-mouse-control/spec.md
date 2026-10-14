# Feature Specification: Mouse Control

**Feature Branch**: `001-mouse-control`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "MCP tool for mouse control operations including move, click, double-click, right-click, middle-click, drag, and scroll"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move Cursor to Coordinates (Priority: P1)

An LLM needs to position the mouse cursor at a specific location on screen to prepare for subsequent click or interaction operations.

**Why this priority**: Cursor positioning is the foundational operation—all other mouse actions depend on the cursor being in the correct location. This must work reliably before any clicks are meaningful.

**Independent Test**: Can be fully tested by invoking the tool with screen coordinates and verifying the cursor arrives at the expected position. Delivers immediate value as LLMs can position the cursor for manual user clicks.

**Acceptance Scenarios**:

1. **Given** the cursor is at any position, **When** the LLM invokes `mouse_control` with action `move` and coordinates (500, 300), **Then** the cursor moves to screen position (500, 300) and the tool returns success with the final cursor position.

2. **Given** a multi-monitor setup with secondary monitor at negative X coordinates, **When** the LLM invokes `move` with coordinates (-500, 200), **Then** the cursor moves to the correct position on the secondary monitor.

3. **Given** coordinates outside all monitor bounds, **When** the LLM invokes `move` with out-of-bounds coordinates, **Then** the tool returns an error indicating the coordinates are invalid and reports the valid screen bounds.

4. **Given** a display running at 150% DPI scale, **When** the LLM invokes `move` with screen coordinates, **Then** the cursor moves to the exact screen position specified (coordinates are always in screen pixels, not scaled pixels).

---

### User Story 2 - Left Click (Priority: P1)

An LLM needs to perform a standard left-click to interact with UI elements such as buttons, menu items, or input fields.

**Why this priority**: Left-click is the most common mouse action for UI interaction. Combined with cursor movement, this enables the LLM to interact with almost any visible UI element.

**Independent Test**: Can be tested by clicking on a known target (e.g., a test window button) and verifying the expected action occurred. Delivers value for basic UI automation.

**Acceptance Scenarios**:

1. **Given** the cursor is positioned over a clickable UI element, **When** the LLM invokes `mouse_control` with action `click`, **Then** a left mouse button press and release occurs at the current cursor position.

2. **Given** the cursor is at any position, **When** the LLM invokes `click` with explicit coordinates (800, 600), **Then** the cursor moves to (800, 600) and performs a left click at that position.

3. **Given** an elevated (admin) process window is under the cursor, **When** the LLM invokes `click`, **Then** the tool returns an error explaining that input cannot be sent to elevated processes due to UIPI restrictions.

4. **Given** the desktop is locked or a UAC prompt is active, **When** the LLM invokes `click`, **Then** the tool returns an appropriate error indicating the secure desktop is active.

---

### User Story 3 - Double Click (Priority: P2)

An LLM needs to perform a double-click to open files, select words in text, or trigger double-click actions in applications.

**Why this priority**: Double-click is essential for file operations and text selection but is used less frequently than single clicks.

**Independent Test**: Can be tested by double-clicking on a known target and verifying the double-click action occurred (e.g., word selection in a text field).

**Acceptance Scenarios**:

1. **Given** the cursor is positioned over a selectable element, **When** the LLM invokes `mouse_control` with action `double_click`, **Then** two rapid left clicks occur at the current position with appropriate inter-click timing.

2. **Given** coordinates are provided with `double_click`, **When** the action is invoked, **Then** the cursor moves to the coordinates before performing the double-click.

---

### User Story 4 - Right Click (Priority: P2)

An LLM needs to perform a right-click to access context menus.

**Why this priority**: Context menus are a common Windows interaction pattern for accessing additional options.

**Independent Test**: Can be tested by right-clicking on a known target and verifying a context menu appears.

**Acceptance Scenarios**:

1. **Given** the cursor is positioned over any UI element, **When** the LLM invokes `mouse_control` with action `right_click`, **Then** a right mouse button press and release occurs at the current position.

2. **Given** coordinates are provided with `right_click`, **When** the action is invoked, **Then** the cursor moves to the coordinates before performing the right-click.

---

### User Story 5 - Middle Click (Priority: P3)

An LLM needs to perform a middle-click for actions like opening links in new tabs or activating auto-scroll.

**Why this priority**: Middle-click is less common but important for browser automation and specialized applications.

**Independent Test**: Can be tested in a browser by middle-clicking a link and verifying it opens in a new tab.

**Acceptance Scenarios**:

1. **Given** the cursor is positioned over any UI element, **When** the LLM invokes `mouse_control` with action `middle_click`, **Then** a middle mouse button press and release occurs at the current position.

---

### User Story 6 - Click with Modifier Keys (Priority: P2)

An LLM needs to perform clicks while holding modifier keys (Ctrl, Shift, Alt) for multi-select, range-select, or alternate actions.

**Why this priority**: Modifier-click combinations are essential for file selection, multi-select in lists, and alternate click behaviors.

**Independent Test**: Can be tested by Ctrl+clicking items in a list and verifying multi-selection behavior.

**Acceptance Scenarios**:

1. **Given** the cursor is positioned over a list item, **When** the LLM invokes `click` with modifier `ctrl`, **Then** a Ctrl+left-click occurs, enabling multi-selection behavior.

2. **Given** the cursor is positioned over a list item, **When** the LLM invokes `click` with modifier `shift`, **Then** a Shift+left-click occurs, enabling range-selection behavior.

3. **Given** multiple modifiers are specified, **When** the LLM invokes `click` with modifiers `ctrl` and `shift`, **Then** both modifiers are held during the click.

4. **Given** a modifier click is performed, **When** the operation completes, **Then** all modifier keys are released (no stuck keys).

---

### User Story 7 - Drag Operation (Priority: P2)

An LLM needs to perform drag-and-drop operations to move files, resize windows, or reorder items.

**Why this priority**: Drag operations are necessary for file management and many application interactions.

**Independent Test**: Can be tested by dragging a file from one location to another and verifying it moved.

**Acceptance Scenarios**:

1. **Given** the cursor is at a source location, **When** the LLM invokes `mouse_control` with action `drag` specifying start and end coordinates, **Then** a mouse-down occurs at start, cursor moves to end, and mouse-up occurs at end.

2. **Given** a drag operation is in progress, **When** the destination is an invalid drop target, **Then** the drop still completes (release mouse) but the tool reports the final position.

3. **Given** the user specifies a `button` parameter, **When** `drag` is invoked with `button: right`, **Then** a right-button drag is performed.

---

### User Story 8 - Scroll (Priority: P2)

An LLM needs to scroll the mouse wheel to navigate long documents, scroll lists, or zoom in applications.

**Why this priority**: Scrolling is essential for navigating content that doesn't fit on screen.

**Independent Test**: Can be tested by scrolling in a scrollable window and verifying the content scrolls.

**Acceptance Scenarios**:

1. **Given** the cursor is over a scrollable area, **When** the LLM invokes `mouse_control` with action `scroll` and `direction: down`, **Then** a downward scroll (wheel rotation toward user) occurs.

2. **Given** scroll is invoked with `direction: up`, **Then** an upward scroll (wheel rotation away from user) occurs.

3. **Given** scroll is invoked with `direction: left` or `right`, **Then** a horizontal scroll occurs (if supported by the application).

4. **Given** scroll is invoked with `amount: 3`, **Then** the scroll amount is equivalent to 3 wheel clicks (3 × WHEEL_DELTA).

5. **Given** coordinates are provided with `scroll`, **When** the action is invoked, **Then** the cursor moves to the coordinates before scrolling.

---

### Edge Cases

- What happens when the target window closes during a drag operation?
  - The drag completes (mouse released) and the tool returns partial success indicating the window was lost.
  
- How does the system handle very rapid successive operations?
  - Operations are serialized; the tool waits for each operation to complete before returning.

- How are concurrent MCP requests handled?
  - Concurrent requests are serialized using a mutex lock; a second request blocks until the first completes, preventing interleaved or corrupted input sequences.
  
- What happens if modifier keys are already held by the user?
  - The tool queries current modifier state and only manages modifiers it explicitly pressed.
  
- What happens when coordinates are fractional?
  - Coordinates are truncated to integers; sub-pixel positioning is not supported.
  
- What happens during an active screen capture or game with cursor capture?
  - The tool attempts the operation and reports any failures accurately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST use the `SendInput` Windows API for all mouse operations.
- **FR-002**: The tool MUST NOT use deprecated `mouse_event` API.
- **FR-003**: Coordinates provided to the tool MUST be interpreted as screen coordinates (not client or window-relative).
- **FR-004**: The tool MUST handle multi-monitor setups correctly, including monitors with negative coordinates.
- **FR-005**: The tool MUST be Per-Monitor V2 DPI aware; coordinates are always physical screen pixels.
- **FR-006**: The tool MUST convert screen coordinates to normalized coordinates (0-65535 range) for `SendInput` using the correct formula accounting for multi-monitor geometry.
- **FR-007**: The tool MUST detect when the target is an elevated process and return a clear error before attempting input. Detection is performed by checking the window under the cursor coordinates using `WindowFromPoint`, then inspecting the owning process token via `GetWindowThreadProcessId` and `OpenProcessToken`.
- **FR-008**: The tool MUST release all modifier keys it pressed before returning, even on failure.
- **FR-009**: The tool MUST return the final cursor position after every operation, along with success status and the window title under the cursor (obtained via `GetWindowText`).
- **FR-010**: The tool MUST validate that coordinates are within valid screen bounds before performing operations.
- **FR-011**: The tool MUST support all actions: `move`, `click`, `double_click`, `right_click`, `middle_click`, `drag`, `scroll`.
- **FR-012**: The `click`, `right_click`, `middle_click`, and `double_click` actions MUST accept optional coordinates; if omitted, operate at current cursor position.
- **FR-013**: The `drag` action MUST accept `start_x`, `start_y`, `end_x`, `end_y` parameters.
- **FR-014**: The `scroll` action MUST accept `direction` (up, down, left, right) and optional `amount` (default 1).
- **FR-015**: All click actions MUST accept optional `modifiers` parameter (array of: ctrl, shift, alt).
- **FR-016**: The tool MUST log all operations with correlation ID, action, coordinates, and outcome as structured JSON to stderr (one JSON object per line, preserving stdout for MCP protocol).
- **FR-017**: The tool MUST verify preconditions (valid coordinates, no elevated target) before performing any input.
- **FR-018**: Double-click timing MUST use the system's configured double-click interval from `GetDoubleClickTime()`.
- **FR-019**: The tool MUST handle secure desktop scenarios (UAC, lock screen) by returning a clear error.

### Key Entities

- **MouseAction**: The action to perform (move, click, double_click, right_click, middle_click, drag, scroll)
- **Coordinates**: X and Y screen position in physical pixels
- **MouseButton**: Mouse button for drag operations (left, right, middle)
- **ScrollDirection**: Scroll direction (up, down, left, right)
- **ModifierKey**: Modifier keys held during operation (ctrl, shift, alt)
- **MouseControlResult**: Success status, final cursor position, window title, error details if failed
- **MouseControlErrorCode**: Standardized error codes for programmatic handling

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All mouse operations complete successfully on a standard (non-elevated) Windows 11 desktop.
- **SC-002**: Cursor positioning is accurate to within 1 pixel on all tested DPI scale factors (100%, 125%, 150%, 200%).
- **SC-003**: Multi-monitor scenarios with negative coordinates work correctly without manual configuration.
- **SC-004**: Elevated process detection returns a clear error before any input is attempted.
- **SC-005**: No stuck modifier keys occur after any operation, including failed operations.
- **SC-006**: All operations return within 5 seconds (default timeout configurable via `MCP_MOUSE_TIMEOUT_MS` environment variable for standalone server, or `mcpWindows.mouse.timeoutMs` VS Code setting for bundled extension).
- **SC-007**: Operations are correctly serialized—no race conditions or interleaved inputs.
- **SC-008**: Double-click operations are recognized by Windows as valid double-clicks (word selection works in text editors).
- **SC-009**: Scroll operations work in typical scrollable applications (browsers, file explorers, text editors).
- **SC-010**: Drag operations complete successfully for file drag-and-drop scenarios.

## Clarifications

### Session 2025-12-07

- Q: How should the operation timeout be configurable? → A: Environment variable for standalone MCP Server; VS Code configuration setting for bundled VS Code MCP Server.
- Q: How should operations be logged? → A: Structured JSON to stderr (one JSON object per line).
- Q: How should concurrent MCP requests be handled? → A: Serialize with mutex lock - second request blocks until first completes.
- Q: How should elevated process detection work? → A: Check the specific window under the cursor coordinates before sending input.
- Q: What should the success response include? → A: Success status + final cursor position + window title under cursor.

## Assumptions

- The MCP Server runs at standard (non-elevated) integrity level by default.
- The Windows 11 desktop is accessible (not locked, no UAC dialogs active).
- The user has not disabled Windows animation settings that affect timing.
- Mouse hardware is present and functioning (even if physical mouse is not connected, Windows still processes synthetic mouse events).
- The coordinate system uses the Windows convention where (0,0) is the top-left of the primary monitor.
