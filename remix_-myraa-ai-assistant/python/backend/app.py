from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any
import ctypes
from ctypes import wintypes


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "desktop-data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "myraa.sqlite3"

user32 = ctypes.windll.user32

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulong),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulong),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", INPUT_UNION)]


VK_CODES = {
    "enter": 0x0D,
    "tab": 0x09,
    "esc": 0x1B,
    "escape": 0x1B,
    "space": 0x20,
    "backspace": 0x08,
    "insert": 0x2D,
    "delete": 0x2E,
    "home": 0x24,
    "end": 0x23,
    "pageup": 0x21,
    "pagedown": 0x22,
    "up": 0x26,
    "down": 0x28,
    "left": 0x25,
    "right": 0x27,
    "alt": 0x12,
    "ctrl": 0x11,
    "shift": 0x10,
    "win": 0x5B,
    "f4": 0x73,
    "f5": 0x74,
    "f6": 0x75,
    "f10": 0x79,
}

VK_ALIASES = {
    "control": "ctrl",
    "cmd": "win",
    "command": "win",
    "meta": "win",
    "option": "alt",
    "windows": "win",
    "super": "win",
    "return": "enter",
    "del": "delete",
    "ins": "insert",
    "pgup": "pageup",
    "pgdn": "pagedown",
}


def normalize_key_name(key_name: str) -> str:
    cleaned = str(key_name).strip().lower()
    return VK_ALIASES.get(cleaned, cleaned)


def key_name_to_vk(key_name: str) -> int:
    normalized = normalize_key_name(key_name)
    key = VK_CODES.get(normalized)
    if key is None and len(normalized) == 1:
        key = ord(normalized.upper())
    if key is None:
        raise RuntimeError(f"Unknown key '{key_name}'.")
    return key


def send_key_event(vk_code: int, key_up: bool = False) -> None:
    flags = KEYEVENTF_KEYUP if key_up else 0
    input_record = INPUT(type=1, union=INPUT_UNION(ki=KEYBDINPUT(vk_code, 0, flags, 0, 0)))
    arr = (INPUT * 1)(input_record)
    user32.SendInput(1, arr, ctypes.sizeof(INPUT))


def split_hotkey_sequence(keys: Any) -> list[str]:
    if isinstance(keys, str):
        raw_parts = keys.replace(" ", "").split("+")
    elif isinstance(keys, list):
        raw_parts = []
        for part in keys:
            if isinstance(part, str) and "+" in part:
                raw_parts.extend(part.replace(" ", "").split("+"))
            else:
                raw_parts.append(str(part))
    else:
        raw_parts = [str(keys)]

    cleaned = [normalize_key_name(part) for part in raw_parts if str(part).strip()]
    if not cleaned:
        raise RuntimeError("No hotkey keys provided.")
    return cleaned


def send_hotkey(keys: Any) -> str:
    parts = split_hotkey_sequence(keys)
    vk_codes = [key_name_to_vk(part) for part in parts]
    for vk in vk_codes[:-1]:
        send_key_event(vk, False)
        time.sleep(0.02)
    send_key_event(vk_codes[-1], False)
    time.sleep(0.04)
    send_key_event(vk_codes[-1], True)
    for vk in reversed(vk_codes[:-1]):
        time.sleep(0.02)
        send_key_event(vk, True)
    return f"Sent hotkey {'+'.join(parts)}."


def run_powershell(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def open_application(target: str | None) -> str:
    if not target:
        subprocess.Popen(["explorer.exe"])
        return "Opened File Explorer."
    cleaned = str(target).strip().strip('"')
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        webbrowser.open(cleaned)
        return f"Opened browser to {cleaned}."
    if cleaned.startswith("ms-settings:"):
        os.startfile(cleaned)
        return f"Opened {cleaned}."
    if Path(cleaned).exists():
        os.startfile(cleaned)
        return f"Opened {cleaned}."
    if cleaned.lower() in {"chrome", "google chrome"}:
        subprocess.Popen('start "" chrome', shell=True)
        return "Opened Google Chrome."
    if cleaned.lower() in {"edge", "microsoft edge"}:
        subprocess.Popen('start "" msedge', shell=True)
        return "Opened Microsoft Edge."
    if cleaned.lower() in {"settings", "windows settings"}:
        os.startfile("ms-settings:")
        return "Opened Settings."
    if cleaned.lower() in {"file explorer", "explorer"}:
        subprocess.Popen(["explorer.exe"])
        return "Opened File Explorer."
    if cleaned.lower() in {"terminal", "powershell", "command prompt", "cmd"}:
        subprocess.Popen(["wt.exe"])
        return "Opened Windows Terminal."
    subprocess.Popen(f'start "" "{cleaned}"', shell=True)
    return f"Requested launch of {cleaned}."


def close_application(target: str | None) -> str:
    if not target:
        h_wnd = user32.GetForegroundWindow()
        if h_wnd:
            user32.PostMessageW(h_wnd, 0x0010, 0, 0)  # WM_CLOSE
            return "Closed the active window."
        return "No active window found to close."
    name = Path(str(target)).stem
    result = subprocess.run(["taskkill", "/IM", f"{name}.exe", "/F"], capture_output=True, text=True)
    if result.returncode == 0:
        return f"Closed {name}."
    result = subprocess.run(["taskkill", "/IM", name, "/F"], capture_output=True, text=True)
    if result.returncode == 0:
        return f"Closed {name}."
    raise RuntimeError(result.stderr.strip() or f"Could not close {name}.")


def set_cursor(x: int, y: int) -> str:
    user32.SetCursorPos(int(x), int(y))
    return f"Moved pointer to {x},{y}."


def mouse_click(button: str = "left") -> str:
    if button == "right":
        down, up = MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP
    elif button == "middle":
        down, up = MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP
    else:
        down, up = MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP
    user32.mouse_event(down, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(up, 0, 0, 0, 0)
    return f"Clicked with {button} button."


def mouse_scroll(amount: int) -> str:
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(amount), 0)
    return f"Scrolled by {amount}."


def send_unicode_text(text: str) -> str:
    inputs = []
    for char in text:
        down = INPUT(type=1, union=INPUT_UNION(ki=KEYBDINPUT(0, ord(char), KEYEVENTF_UNICODE, 0, 0)))
        up = INPUT(type=1, union=INPUT_UNION(ki=KEYBDINPUT(0, ord(char), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, 0)))
        inputs.extend([down, up])
    n_inputs = len(inputs)
    arr = (INPUT * n_inputs)(*inputs)
    user32.SendInput(n_inputs, arr, ctypes.sizeof(INPUT))
    return f"Typed {len(text)} characters."


def send_virtual_key(key_name: str) -> str:
    key = key_name_to_vk(key_name)
    send_key_event(key, False)
    time.sleep(0.03)
    send_key_event(key, True)
    return f"Pressed {key_name}."


def activate_alt_tab() -> str:
    send_hotkey(["alt", "tab"])
    return "Switched to the next application."


def show_active_window(command: str) -> str:
    h_wnd = user32.GetForegroundWindow()
    if not h_wnd:
        return "No active window to control."
    if command == "minimize":
        user32.ShowWindow(h_wnd, 6)
        return "Minimized the active window."
    if command == "maximize":
        user32.ShowWindow(h_wnd, 3)
        return "Maximized the active window."
    if command == "restore":
        user32.ShowWindow(h_wnd, 9)
        return "Restored the active window."
    if command == "close":
        user32.PostMessageW(h_wnd, 0x0010, 0, 0)
        return "Closed the active window."
    raise RuntimeError(f"Unsupported window command: {command}")


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS permissions (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT,
                payload TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS workspace_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


DEFAULT_PERMISSIONS: dict[str, bool] = {
    "screenCapture": True,
    "mouseMovement": False,
    "mouseClicks": False,
    "keyboardTyping": False,
    "openingApplications": False,
    "closingApplications": False,
    "fileAccess": False,
    "clipboardAccess": False,
    "browserAutomation": False,
    "powerShellCommands": False,
    "commandPromptCommands": False,
    "registryChanges": False,
    "administratorActions": False,
}


def get_permissions() -> dict[str, bool]:
    with connect_db() as conn:
        rows = conn.execute("SELECT key, value FROM permissions").fetchall()
        permissions = dict(DEFAULT_PERMISSIONS)
        for row in rows:
            permissions[row["key"]] = bool(row["value"])
        return permissions


def set_permissions(data: dict[str, Any]) -> dict[str, bool]:
    permissions = dict(DEFAULT_PERMISSIONS)
    permissions.update({k: bool(v) for k, v in data.items()})
    with connect_db() as conn:
        for key, value in permissions.items():
            conn.execute(
                """
                INSERT INTO permissions (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
                """,
                (key, int(value)),
            )
        conn.commit()
    return permissions


def get_preference(key: str, fallback: Any = None) -> Any:
    with connect_db() as conn:
        row = conn.execute("SELECT value FROM preferences WHERE key = ?", (key,)).fetchone()
        if not row:
            return fallback
        try:
            return json.loads(row["value"])
        except Exception:
            return row["value"]


def set_preference(key: str, value: Any) -> dict[str, Any]:
    payload = json.dumps(value)
    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO preferences (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
            """,
            (key, payload),
        )
        conn.commit()
    return {"key": key, "value": value}


def save_json_row(table: str, row: dict[str, Any]) -> dict[str, Any]:
    with connect_db() as conn:
        conn.execute(
            f"""
            INSERT INTO {table} (id, payload, created_at, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP
            """,
            (row["id"], json.dumps(row)),
        )
        conn.commit()
    return row


def handle_message(message: dict[str, Any]) -> dict[str, Any]:
    method = message.get("method")
    params = message.get("params", {})

    if method == "runtime.info":
        return {
            "status": "ready",
            "platform": os.name,
            "message": "Myraa native desktop bridge is running.",
        }

    if method == "permissions.get":
        return get_permissions()

    if method == "permissions.set":
        return set_permissions(params.get("permissions", {}))

    if method == "preferences.get":
        return {"key": params.get("key"), "value": get_preference(params.get("key", ""), params.get("fallback"))}

    if method == "preferences.set":
        return set_preference(params.get("key", ""), params.get("value"))

    if method == "desktop.startVision":
        return {
            "result": "Desktop Vision session requested from the native Windows bridge.",
            "note": "Native screen capture implementation still needs Windows API wiring.",
        }

    if method == "desktop.stopVision":
        return {"result": "Desktop Vision session stopped."}

    if method == "desktop.runAction":
        action = params.get("action", "unknown")
        target = params.get("target")
        text = params.get("text")
        path_value = params.get("path")
        confirm = bool(params.get("confirm"))

        try:
            if action in {"deleteFiles", "formatDrive", "registryChange", "administratorAction", "uninstallSoftware", "purchase", "sendEmail", "executeScript"} and not confirm:
                raise RuntimeError(f"{action} requires confirmation before execution.")

            if action in {"openApplication", "openChrome", "openSettings", "openFileExplorer", "openTerminal"}:
                actual_target = target
                if action == "openChrome" and not actual_target:
                    actual_target = "chrome"
                if action == "openSettings" and not actual_target:
                    actual_target = "ms-settings:"
                if action == "openFileExplorer" and not actual_target:
                    actual_target = "explorer"
                if action == "openTerminal" and not actual_target:
                    actual_target = "terminal"
                message = open_application(actual_target)
                return {"result": message, "action": action, "target": target}

            if action in {"closeApplication", "closeWindow"}:
                if action == "closeWindow" and target:
                    return {"result": close_application(target), "action": action, "target": target}
                return {"result": show_active_window("close"), "action": action, "target": target}

            if action == "switchApplication":
                return {"result": activate_alt_tab(), "action": action, "target": target}

            if action == "minimizeWindow":
                return {"result": show_active_window("minimize"), "action": action, "target": target}

            if action == "maximizeWindow":
                return {"result": show_active_window("maximize"), "action": action, "target": target}

            if action == "restoreWindow":
                return {"result": show_active_window("restore"), "action": action, "target": target}

            if action in {"moveMouse", "movePointer"}:
                x = int(params.get("x", 0))
                y = int(params.get("y", 0))
                return {"result": set_cursor(x, y), "action": action, "target": target}

            if action in {"hotkey", "keyboardShortcut"}:
                keys_value = params.get("keys") or params.get("shortcut") or params.get("sequence") or params.get("key") or params.get("text") or target
                if not keys_value:
                    raise RuntimeError("No hotkey sequence provided.")
                return {"result": send_hotkey(keys_value), "action": action, "target": target}

            if action in {"click", "press"}:
                x = params.get("x")
                y = params.get("y")
                button = params.get("button", "left")
                if x is not None and y is not None:
                    set_cursor(int(x), int(y))
                if action == "press":
                    keys_value = params.get("keys") or params.get("shortcut")
                    if keys_value:
                        return {"result": send_hotkey(keys_value), "action": action, "target": target}
                    key_name = str(params.get("key") or params.get("text") or target or "enter")
                    return {"result": send_virtual_key(key_name), "action": action, "target": target}
                return {"result": mouse_click(button), "action": action, "target": target}

            if action == "type":
                typed = str(text or target or "")
                if not typed:
                    raise RuntimeError("No text provided to type.")
                return {"result": send_unicode_text(typed), "action": action, "target": target}

            if action == "scroll":
                amount = int(params.get("amount", 120))
                direction = str(params.get("direction", "down")).lower()
                if direction == "up":
                    amount = -abs(amount)
                else:
                    amount = abs(amount)
                return {"result": mouse_scroll(amount), "action": action, "target": target}

            if action == "clipboardWrite":
                payload = str(text or target or "")
                subprocess.run("clip", input=payload, text=True, shell=True, capture_output=True)
                return {"result": "Copied text to clipboard.", "action": action, "target": target}

            if action == "clipboardRead":
                result = run_powershell("Get-Clipboard")
                return {"result": result.stdout.strip() or "Clipboard is empty.", "action": action, "target": target}

            if action == "copyClipboard":
                return {"result": send_hotkey(["ctrl", "c"]), "action": action, "target": target}

            if action == "pasteClipboard":
                return {"result": send_hotkey(["ctrl", "v"]), "action": action, "target": target}

            if action == "fileExplorer":
                if path_value:
                    os.startfile(path_value)
                    return {"result": f"Opened {path_value} in File Explorer.", "action": action, "target": target, "path": path_value}
                subprocess.Popen(["explorer.exe"])
                return {"result": "Opened File Explorer.", "action": action, "target": target}

            if action == "navigateDownloads":
                downloads = Path.home() / "Downloads"
                subprocess.Popen(["explorer.exe", str(downloads)])
                return {"result": f"Opened {downloads}.", "action": action, "target": target}

            if action == "browserAutomation":
                destination = str(target or path_value or text or "")
                if destination:
                    webbrowser.open(destination)
                    return {"result": f"Opened browser to {destination}.", "action": action, "target": target}
                raise RuntimeError("No browser destination provided.")

            if action == "runPowerShell":
                command = str(text or target or "")
                if not command:
                    raise RuntimeError("No PowerShell command provided.")
                result = run_powershell(command)
                if result.returncode != 0:
                    raise RuntimeError(result.stderr.strip() or "PowerShell command failed.")
                return {"result": result.stdout.strip() or "PowerShell command completed.", "action": action, "target": target}

            if action == "runCommandPrompt":
                command = str(text or target or "")
                if not command:
                    raise RuntimeError("No Command Prompt command provided.")
                result = subprocess.run(["cmd.exe", "/c", command], capture_output=True, text=True, timeout=60)
                if result.returncode != 0:
                    raise RuntimeError(result.stderr.strip() or "Command Prompt command failed.")
                return {"result": result.stdout.strip() or "Command Prompt command completed.", "action": action, "target": target}

            if action == "deleteFiles":
                delete_target = Path(str(path_value or target or "")).expanduser()
                if not delete_target.exists():
                    raise RuntimeError(f"Path not found: {delete_target}")
                if delete_target.is_dir():
                    for child in delete_target.iterdir():
                        if child.is_dir():
                            import shutil
                            shutil.rmtree(child)
                        else:
                            child.unlink()
                    return {"result": f"Deleted contents of {delete_target}.", "action": action, "target": target, "path": str(delete_target)}
                delete_target.unlink()
                return {"result": f"Deleted {delete_target}.", "action": action, "target": target, "path": str(delete_target)}

            if action == "registryChange":
                raise RuntimeError("Registry changes are intentionally not implemented yet.")

            if action == "administratorAction":
                raise RuntimeError("Administrator actions are intentionally not implemented yet.")

            if action == "formatDrive":
                raise RuntimeError("Format drive is intentionally blocked.")

            if action in {"sendEmail", "uninstallSoftware", "purchase", "executeScript"}:
                raise RuntimeError(f"{action} is not implemented in the native bridge yet.")

            raise RuntimeError(f"Unsupported desktop action: {action}")
        except Exception as exc:
            return {"error": str(exc), "action": action, "target": target, "path": path_value}

    if method == "database.info":
        return {
            "result": f"SQLite database ready at {DB_PATH}",
        }

    if method == "conversation.save":
        payload = params.get("conversation", {})
        conversation_id = payload.get("id")
        if not conversation_id:
            raise ValueError("conversation.id is required")
        save_json_row("conversations", payload)
        return {"result": "Conversation stored locally.", "id": conversation_id}

    if method == "memory.save":
        payload = params.get("memory", {})
        memory_id = payload.get("id")
        if not memory_id:
            raise ValueError("memory.id is required")
        with connect_db() as conn:
            conn.execute(
                """
                INSERT INTO memories (id, category, text, created_at, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET category=excluded.category, text=excluded.text, updated_at=CURRENT_TIMESTAMP
                """,
                (memory_id, payload.get("category", "general"), payload.get("text", "")),
            )
            conn.commit()
        return {"result": "Memory stored locally.", "id": memory_id}

    raise ValueError(f"Unknown bridge method: {method}")


def bridge_loop() -> None:
    init_db()
    print(json.dumps({"type": "ready", "status": "ready", "message": "Myraa native bridge online."}), flush=True)
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
            request_id = message.get("id")
            response = handle_message(message)
            print(json.dumps({"id": request_id, "ok": True, "data": response}), flush=True)
        except Exception as exc:  # noqa: BLE001
            request_id = None
            try:
                request_id = json.loads(line).get("id")
            except Exception:
                pass
            print(json.dumps({"id": request_id, "ok": False, "error": str(exc)}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bridge", action="store_true")
    args = parser.parse_args()

    if args.bridge:
        bridge_loop()
        return

    init_db()
    print(f"Myraa desktop database initialized at {DB_PATH}")


if __name__ == "__main__":
    main()
