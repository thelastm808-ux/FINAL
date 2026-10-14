"""
folder_tool.py
=================================================================
A deep, recursive folder analysis tool with an integrated AI
Assistant powered by Gemini. 

- Features: Q&A, Move, Copy, Rename, Delete, Compress, Create, Sort
- Remembers your API key and all previously scanned paths.
- Creates isolated local databases for every folder.
=================================================================
"""

import os
import sys
import json
import shutil
import hashlib
import subprocess
from datetime import datetime
import google.generativeai as genai

CONFIG_FILE = "folder_tool_config.json"
SKIP_FOLDERS = {'node_modules', '.git', '__pycache__', '.venv', 'venv', 'build', 'dist'}

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def section(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

def format_size(size_in_bytes):
    for unit in ['Bytes', 'KB', 'MB', 'GB', 'TB']:
        if size_in_bytes < 1024.0:
            if unit == 'Bytes': return f"{size_in_bytes} {unit}"
            return f"{size_in_bytes:.2f} {unit}"
        size_in_bytes /= 1024.0
    return f"{size_in_bytes:.2f} PB"

# ----------------------------------------------------------------------
# 1. MEMORY, CONFIGURATION & SCANNING
# ----------------------------------------------------------------------

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {"api_key": "", "history": [], "last_active": ""}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"api_key": "", "history": [], "last_active": ""}

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)

def get_db_filename(path):
    return f"scan_{hashlib.md5(path.encode('utf-8')).hexdigest()}.json"

def load_analysis(path):
    if not path: return None
    db_file = get_db_filename(path)
    if not os.path.exists(db_file): return None
    try:
        with open(db_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def scan_directory(base_path, config):
    if not os.path.exists(base_path):
        print(f"\n[!] Error: The path '{base_path}' does not exist.")
        return None

    print(f"\nScanning '{base_path}' (this may take a moment)...")
    file_data, folder_sizes = [], {} 
    
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]
        current_folder_size = 0
        for f in files:
            file_path = os.path.join(root, f)
            size = 0
            try: size = os.path.getsize(file_path)
            except OSError: pass 
            current_folder_size += size
            file_data.append({
                "name": f, "path": file_path, "size": size,
                "type": os.path.splitext(f)[1].lower() or "file"
            })
        folder_sizes[root] = folder_sizes.get(root, 0) + current_folder_size

    folder_data = []
    sorted_roots = sorted(folder_sizes.keys(), key=lambda x: x.count(os.sep), reverse=True)
    for r in sorted_roots:
        parent = os.path.dirname(r)
        if parent in folder_sizes and r != base_path:
            folder_sizes[parent] += folder_sizes[r]

    for r, size in folder_sizes.items():
        folder_data.append({"name": os.path.basename(r) or r, "path": r, "size": size, "type": "folder"})

    analysis = {
        "base_path": base_path, "total_files": len(file_data), "total_size": folder_sizes.get(base_path, 0),
        "files": file_data, "folders": folder_data
    }
    
    with open(get_db_filename(base_path), "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=4)
        
    if base_path not in config["history"]: config["history"].append(base_path)
    config["last_active"] = base_path
    save_config(config)
    print(f"Scan complete! Data saved locally.")
    return analysis

# ----------------------------------------------------------------------
# 2. UNIVERSAL TARGET RESOLVER (Handles Disambiguation)
# ----------------------------------------------------------------------

def resolve_target(db, target_name):
    if not target_name: return None
    matches = [item for item in db['folders'] + db['files'] if item['name'].lower() == target_name.lower()]
    
    if len(matches) == 0:
        print(f"Error: Could not find any item named '{target_name}'.")
        return None
    if len(matches) == 1:
        return matches[0]
        
    print(f"\nFound {len(matches)} items matching '{target_name}'. Which one do you mean?")
    for i, match in enumerate(matches):
        kind = "Folder" if match['type'] == "folder" else "File"
        print(f"  [{i+1}] {kind}: {match['path']} ({format_size(match['size'])})")
        
    print("  [0] Cancel")
    choice = input(f"\nSelect a number (1-{len(matches)}): ").strip()
    if not choice.isdigit() or int(choice) == 0 or int(choice) > len(matches):
        print("Action cancelled.")
        return None
    return matches[int(choice)-1]

# ----------------------------------------------------------------------
# 3. ACTION HANDLERS
# ----------------------------------------------------------------------

def resolve_path(path_str):
    if not path_str: return ""
    if path_str.lower() == "desktop": return os.path.join(os.path.expanduser("~"), "Desktop")
    if path_str.lower() == "documents": return os.path.join(os.path.expanduser("~"), "Documents")
    if path_str.lower() in ["here", "current", "active"]: return ""
    return path_str

def execute_action(db, parsed):
    action = parsed.get("action_type")
    target_name = parsed.get("target_name")
    dest_raw = parsed.get("destination_path")
    modifier = parsed.get("modifier")
    
    # --- CREATION ACTIONS ---
    if action in ["create_folder", "create_file"]:
        name = target_name or dest_raw
        if not name: 
            print("Error: No name provided for creation.")
            return
        full_path = os.path.join(db['base_path'], name) 
        
        if action == "create_folder":
            os.makedirs(full_path, exist_ok=True)
            print(f"Success: Created folder at {full_path}")
        elif action == "create_file":
            with open(full_path, 'w') as f: pass
            print(f"Success: Created file shell at {full_path}")
        return

    # --- ACTIONS REQUIRING AN EXISTING TARGET ---
    target = resolve_target(db, target_name)
    if not target: return
    t_path = target['path']

    if action == "move":
        dest = resolve_path(dest_raw) or db['base_path']
        os.makedirs(dest, exist_ok=True)
        print(f"Moving: {t_path} -> {dest}")
        shutil.move(t_path, dest)
        
    elif action == "copy":
        dest = resolve_path(dest_raw) or db['base_path']
        os.makedirs(dest, exist_ok=True)
        print(f"Copying: {t_path} -> {dest}")
        if target['type'] == 'folder':
            shutil.copytree(t_path, os.path.join(dest, target['name']))
        else:
            shutil.copy2(t_path, dest)

    elif action == "rename":
        if not dest_raw: 
            print("Error: No new name provided.")
            return
        new_path = os.path.join(os.path.dirname(t_path), dest_raw)
        print(f"Renaming: {t_path} -> {new_path}")
        os.rename(t_path, new_path)

    elif action == "delete":
        ans = input(f"WARNING: Are you sure you want to permanently delete {t_path}? (y/n): ")
        if ans.lower() == 'y':
            if target['type'] == 'folder': shutil.rmtree(t_path)
            else: os.remove(t_path)
            print("Deleted successfully.")
        else: print("Deletion aborted.")

    elif action == "copy_path":
        subprocess.run(f'echo | set /p="{t_path}" | clip', shell=True)
        print(f"Copied to clipboard: {t_path}")

    elif action == "open_cmd":
        p = t_path if target['type'] == 'folder' else os.path.dirname(t_path)
        subprocess.Popen(f'start cmd /K "cd /d \"{p}\""', shell=True)
        print(f"Opened CMD at: {p}")

    elif action == "compress":
        fmt = 'tar' if modifier and 'tar' in modifier.lower() else 'zip'
        if modifier and '7z' in modifier.lower():
            print("Note: Native Python doesn't support 7z creation natively. Falling back to ZIP.")
            fmt = 'zip'
            
        dest = resolve_path(dest_raw) or os.path.dirname(t_path)
        archive_name = os.path.join(dest, target['name'])
        
        print(f"Compressing {t_path} into {archive_name}.{fmt} ...")
        if target['type'] == 'folder':
            shutil.make_archive(archive_name, fmt, t_path)
        else:
            import zipfile
            with zipfile.ZipFile(f"{archive_name}.zip", 'w') as zf:
                zf.write(t_path, arcname=os.path.basename(t_path))
        print("Compression complete!")

    elif action == "sort":
        if target['type'] != 'folder':
            print("Error: You can only sort folders, not files.")
            return
            
        print(f"\n[Live Sort Results for: {target['name']}]")
        items = []
        for f in os.scandir(t_path):
            stat = f.stat()
            items.append({
                "name": f.name, "size": stat.st_size,
                "date": stat.st_mtime, "type": "Folder" if f.is_dir() else os.path.splitext(f.name)[1].lower()
            })
            
        mod = (modifier or "").lower()
        if "size" in mod: items.sort(key=lambda x: x["size"], reverse=True)
        elif "date" in mod: items.sort(key=lambda x: x["date"], reverse=True)
        elif "type" in mod: items.sort(key=lambda x: x["type"])
        else: items.sort(key=lambda x: x["name"].lower())
        
        print(f"{'NAME':<40} | {'TYPE':<10} | {'SIZE':<12} | {'LAST MODIFIED'}")
        print("-" * 85)
        for i in items:
            dt = datetime.fromtimestamp(i["date"]).strftime('%Y-%m-%d %H:%M')
            print(f"{i['name'][:38]:<40} | {i['type']:<10} | {format_size(i['size']):<12} | {dt}")

    print("\nNote: Action completed. You should Re-Scan this folder to update the local database.")

# ----------------------------------------------------------------------
# 4. AI INTEGRATION
# ----------------------------------------------------------------------

def clean_json_response(text):
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

def ask_ai_assistant(db, config):
    try: model = genai.GenerativeModel('gemini-2.5-flash')
    except Exception as e:
        print(f"Error initializing Gemini: {e}")
        return

    formatted_total = format_size(db['total_size'])
    compressed_data = f"Base Path: {db['base_path']}\nTotal Size: {formatted_total} (Raw: {db['total_size']} bytes)\nTotal Files: {db['total_files']}\n\n"
    
    lines = []
    for f in db['folders']: lines.append(f"[DIR] {f['path']} (Size: {format_size(f['size'])})")
    for f in db['files']: lines.append(f"[FILE] {f['path']} (Size: {format_size(f['size'])}) Ext:{f['type']}")
    data_str = "\n".join(lines)[:500000]

    history_summary = "GLOBAL SCANNED FOLDERS:\n"
    for path in config.get("history", []):
        hist_db = load_analysis(path)
        if hist_db:
            history_summary += f"- '{path}' | Size: {format_size(hist_db['total_size'])} | Files: {hist_db['total_files']}\n"

    while True:
        section(f"AI ASSISTANT (Active: {db['base_path']})")
        print("Type a query  (e.g., 'What is the size of the documents folder?')")
        print("Type a command (e.g., 'Open CMD in eco', 'Copy path of notes.pdf', 'Zip the project folder')")
        print("Type 'back' to return to the main menu.")
        
        user_input = input("\nAssistant> ").strip()
        if user_input.lower() == 'back': break
        if not user_input: continue

        print("\nThinking...")

        intent_prompt = f"""
        Analyze the user's input: "{user_input}"
        
        Is this a QUESTION, or an ACTION?
        Reply ONLY with a raw JSON object matching this schema exactly (no markdown):
        {{
           "intent": "question" or "action",
           "action_type": "move" | "copy" | "rename" | "delete" | "create_folder" | "create_file" | "compress" | "copy_path" | "open_cmd" | "sort" | "none",
           "target_name": "exact name of existing file/folder to act upon (or null)",
           "destination_path": "path for moves/copies, or new name for rename/create (or null)",
           "modifier": "sort criteria (size/date/name/type) or compress format (zip/tar) (or null)"
        }}
        """
        
        try:
            response = model.generate_content(intent_prompt)
            parsed = json.loads(clean_json_response(response.text))
        except Exception:
            print("[!] Could not parse command. Please check your phrasing or API key.")
            continue

        if parsed.get("intent") == "question":
            qa_prompt = f"""
            [GLOBAL FOLDER METADATA]
            {history_summary}
            
            [ACTIVE TARGET DEEP DATA]
            {compressed_data}
            {data_str}
            
            USER QUESTION: "{user_input}"
            
            1. If asked about folders in the Global list, answer using that data.
            2. If asked about deep specifics not in the Active data, tell them to switch folders.
            3. Use human-readable sizes. Be concise.
            """
            try:
                qa_response = model.generate_content(qa_prompt)
                print("\n[AI Answer]:\n" + qa_response.text)
            except Exception as e:
                print(f"Error generating answer: {e}")
        elif parsed.get("intent") == "action":
            execute_action(db, parsed)
        else:
            print("Command not recognized as a supported question or action.")
            
        input("\nPress Enter to continue...")

# ----------------------------------------------------------------------
# 5. STARTUP & MAIN MENU
# ----------------------------------------------------------------------

def main():
    clear_screen()
    config = load_config()
    
    if not config.get("api_key"):
        section("FIRST TIME SETUP: GEMINI API")
        print("To use the AI Assistant, please enter your Gemini API Key.")
        config["api_key"] = input("\nEnter API Key: ").strip()
        save_config(config)
        clear_screen()
        
    genai.configure(api_key=config["api_key"])
    
    if not config.get("history"):
        section("FIRST TIME SETUP: TARGET FOLDER")
        print("I need a folder to analyze. Provide a full path (e.g. C:\\Users\\Me\\Documents)")
        scan_directory(input("\nEnter Folder Path: ").strip(), config)
        input("\nPress Enter to open the main menu...")

    while True:
        clear_screen()
        config = load_config() 
        active_path = config.get("last_active", "None")
        db = load_analysis(active_path)
        
        print("=" * 60)
        print(" SMART FOLDER TOOL & AI ASSISTANT  (folder_tool.py)")
        print(f" Active Target: {active_path}")
        print("=" * 60)
        print("  [1] Open AI Assistant (Query & File Operations)")
        print("  [2] Re-Scan Active Target (To update changes)")
        print("  [3] Scan a Brand New Folder")
        print("  [4] Switch to a Previously Scanned Folder")
        print("  [0] Exit")
        print("-" * 60)
        
        choice = input("Select an option: ").strip()
        
        if choice == "0": sys.exit(0)
        elif choice == "1":
            if db: ask_ai_assistant(db, config)
            else:
                print("\n[!] Database missing. Please Re-Scan it (Option 2).")
                input("Press Enter to continue...")
        elif choice == "2":
            if active_path and active_path != "None": scan_directory(active_path, config)
            input("\nPress Enter to continue...")
        elif choice == "3":
            section("SCAN NEW FOLDER")
            scan_directory(input("Enter the full path of the new folder: ").strip(), config)
            input("\nPress Enter to continue...")
        elif choice == "4":
            section("SWITCH ACTIVE FOLDER")
            history = config.get("history", [])
            if not history: print("No history available.")
            else:
                print("Previously scanned folders:")
                for i, p in enumerate(history): print(f"  [{i+1}] {p}")
                print("  [0] Cancel")
                sel = input(f"\nSelect a folder (1-{len(history)}): ").strip()
                if sel.isdigit() and 0 < int(sel) <= len(history):
                    config["last_active"] = history[int(sel)-1]
                    save_config(config)
                    print(f"\nSwitched active target to: {config['last_active']}")
            input("\nPress Enter to continue...")

if __name__ == "__main__":
    main()