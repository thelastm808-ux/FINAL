"""
apps_tool.py
=================================================================
A lightweight, zero-background-usage tool to track installed and 
default Windows applications. 

It maintains a local JSON database to remember app states and 
can detect what has been installed or uninstalled since the last run.
=================================================================
"""

import winreg
import subprocess
import json
import os
import sys

# The local database file where the tool remembers your apps
DATABASE_FILE = "apps_database.json"

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def section(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

# ----------------------------------------------------------------------
# Core Scanning Functions (Ultra-Low CPU/RAM via Registry)
# ----------------------------------------------------------------------

def get_installed_apps():
    """
    Scans the Windows Registry for standard desktop programs (Win32).
    This is hundreds of times faster and uses less RAM than WMI or PowerShell.
    """
    apps = set()
    registry_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
    ]

    for hive, subkey in registry_paths:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        sub = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, sub) as app_key:
                            try:
                                name = winreg.QueryValueEx(app_key, "DisplayName")[0]
                                # Filter out raw Windows Updates so the list stays clean
                                if name and not name.startswith("KB") and "Update" not in sub:
                                    apps.add(name.strip())
                            except FileNotFoundError:
                                # App has no DisplayName, ignore it
                                continue
                    except OSError:
                        continue
        except OSError:
            continue
            
    return sorted(list(apps))


def get_default_apps():
    """
    Scans for Default/Modern Windows Apps (UWP/Store Apps).
    Uses a highly targeted PowerShell command to exclude hidden frameworks.
    """
    ps_cmd = (
        "Get-AppxPackage -User $env:USERNAME | "
        "Where-Object {$_.IsFramework -eq $false -and $_.NonRemovable -eq $false} | "
        "Select-Object -ExpandProperty Name"
    )
    
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW
        )
        if result.returncode == 0:
            # Clean up the output list
            raw_apps = result.stdout.strip().splitlines()
            clean_apps = [app.strip() for app in raw_apps if app.strip()]
            return sorted(clean_apps)
        return []
    except Exception:
        return []

# ----------------------------------------------------------------------
# Database & Memory Functions
# ----------------------------------------------------------------------

def load_database():
    """Loads the remembered apps from the local JSON file."""
    if not os.path.exists(DATABASE_FILE):
        return {"installed": [], "default": []}
    try:
        with open(DATABASE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"installed": [], "default": []}


def save_database(data):
    """Saves the current state of apps to the local JSON file."""
    try:
        with open(DATABASE_FILE, "w") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"Error saving database: {e}")


def sync_and_detect_changes():
    """
    Scans the system, compares it to the database, detects installs/uninstalls, 
    and updates the database if necessary.
    """
    print("Scanning system... (This is optimized for low CPU/RAM)")
    
    current_installed = get_installed_apps()
    current_default = get_default_apps()
    
    db = load_database()
    old_installed = set(db.get("installed", []))
    old_default = set(db.get("default", []))
    
    cur_installed_set = set(current_installed)
    cur_default_set = set(current_default)
    
    # Calculate differences (What is new? What is gone?)
    new_installed = cur_installed_set - old_installed
    rem_installed = old_installed - cur_installed_set
    
    new_default = cur_default_set - old_default
    rem_default = old_default - cur_default_set
    
    changes_detected = False

    if new_installed or new_default or rem_installed or rem_default:
        changes_detected = True
        clear_screen()
        section("SYSTEM CHANGES DETECTED SINCE LAST RUN")
        
        for app in new_installed:
            print(f"  [+] INSTALLED: {app}")
        for app in new_default:
            print(f"  [+] INSTALLED (Default App): {app}")
            
        for app in rem_installed:
            print(f"  [-] UNINSTALLED: {app}")
        for app in rem_default:
            print(f"  [-] UNINSTALLED (Default App): {app}")
            
        print("\nUpdating local database to remember these changes...")
        
        # Update and save
        db["installed"] = current_installed
        db["default"] = current_default
        save_database(db)
        input("\nPress Enter to continue to the main menu...")
    else:
        # If it's the very first time running, save quietly
        if not old_installed and not old_default:
            db["installed"] = current_installed
            db["default"] = current_default
            save_database(db)

    return db

# ----------------------------------------------------------------------
# Main Menu
# ----------------------------------------------------------------------

def main():
    # Sync memory on startup
    clear_screen()
    db = sync_and_detect_changes()
    
    while True:
        clear_screen()
        print("=" * 60)
        print(" WINDOWS APP TRACKER  (apps_tool.py)")
        print(" Database state: UP TO DATE")
        print("=" * 60)
        print("  [1] Show Installed Apps")
        print("  [2] Show Default Apps")
        print("  [0] Exit")
        print("-" * 60)
        
        choice = input("Select an option: ").strip()
        
        if choice == "0":
            sys.exit(0)
            
        elif choice == "1":
            section("INSTALLED APPS")
            for app in db.get("installed", []):
                print(app)
            input("\nPress Enter to go back...")
            
        elif choice == "2":
            section("DEFAULT APPS")
            for app in db.get("default", []):
                print(app)
            input("\nPress Enter to go back...")
            
        else:
            continue

if __name__ == "__main__":
    if os.name != "nt":
        print("This tool is designed for Windows.")
        sys.exit(1)
    main()