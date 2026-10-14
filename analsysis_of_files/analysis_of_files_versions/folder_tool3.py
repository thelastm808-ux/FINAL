"""
folder_tool.py
=================================================================
A deep, recursive folder analysis tool with an integrated AI
Assistant powered by Gemini. 

- Remembers your API key and all previously scanned paths.
- Creates isolated local databases for every folder.
- Uses Gemini purely for natural language parsing (Q&A and Actions).
- Automatically handles disambiguation for file operations.
=================================================================
"""

import os
import sys
import json
import shutil
import hashlib
import google.generativeai as genai

CONFIG_FILE = "folder_tool_config.json"
SKIP_FOLDERS = {'node_modules', '.git', '__pycache__', '.venv', 'venv', 'build', 'dist'}

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def section(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

# ----------------------------------------------------------------------
# 1. MEMORY & CONFIGURATION 
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
    path_hash = hashlib.md5(path.encode('utf-8')).hexdigest()
    return f"scan_{path_hash}.json"

def load_analysis(path):
    if not path:
        return None
    db_file = get_db_filename(path)
    if not os.path.exists(db_file):
        return None
    try:
        with open(db_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

# ----------------------------------------------------------------------
# 2. CORE ANALYSIS
# ----------------------------------------------------------------------

def scan_directory(base_path, config):
    if not os.path.exists(base_path):
        print(f"\n[!] Error: The path '{base_path}' does not exist.")
        return None

    print(f"\nScanning '{base_path}' (this may take a moment)...")
    
    file_data = []
    folder_sizes = {} 
    
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]
        
        current_folder_size = 0
        for f in files:
            file_path = os.path.join(root, f)
            size = 0
            try:
                size = os.path.getsize(file_path)
            except OSError:
                size = 0 
                
            current_folder_size += size
            file_data.append({
                "name": f,
                "path": file_path,
                "size": size,
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
        folder_data.append({
            "name": os.path.basename(r) or r,
            "path": r,
            "size": size,
            "type": "folder"
        })

    analysis = {
        "base_path": base_path,
        "total_files": len(file_data),
        "total_size": folder_sizes.get(base_path, 0),
        "files": file_data,
        "folders": folder_data
    }
    
    db_file = get_db_filename(base_path)
    with open(db_file, "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=4)
        
    if base_path not in config["history"]:
        config["history"].append(base_path)
    config["last_active"] = base_path
    save_config(config)
        
    print(f"Scan complete! Data saved locally.")
    return analysis

# ----------------------------------------------------------------------
# 3. AI INTEGRATION (Q&A and Intent Parsing)
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

def ask_ai_assistant(db):
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
    except Exception as e:
        print(f"Error initializing Gemini: {e}")
        return

    # Master summary that was previously missing from the final prompt!
    compressed_data = f"Base Path: {db['base_path']}\n"
    compressed_data += f"Total Size: {db['total_size']} bytes\n"
    compressed_data += f"Total Files: {db['total_files']}\n\n"
    
    lines = []
    for f in db['folders']: lines.append(f"[DIR] {f['path']} ({f['size']} bytes)")
    for f in db['files']: lines.append(f"[FILE] {f['path']} ({f['size']} bytes) Ext:{f['type']}")
    
    data_str = "\n".join(lines)
    if len(data_str) > 500000:
        data_str = data_str[:500000] + "\n...[DATA TRUNCATED]..."

    while True:
        section(f"AI ASSISTANT (Active: {db['base_path']})")
        print("Type a question (e.g. 'How many .py files are there?')")
        print("Type a command  (e.g. 'Move project1 to Desktop')")
        print("Type 'back' to return to the main menu.")
        
        user_input = input("\nAssistant> ").strip()
        if user_input.lower() == 'back':
            break
        if not user_input:
            continue

        print("\nThinking...")

        intent_prompt = f"""
        You are an AI coordinating a local Python file system tool.
        Analyze the user's input: "{user_input}"
        
        Is this a QUESTION about the file system, or an ACTION (like move/copy/delete)?
        Reply ONLY with a raw JSON object matching this schema exactly (no markdown):
        {{
           "intent": "question" or "action",
           "action_type": "move" or "none",
           "target_name": "exact name of file/folder to act upon" or null,
           "destination_path": "where they want it moved" or null
        }}
        """
        
        try:
            response = model.generate_content(intent_prompt)
            json_text = clean_json_response(response.text)
            parsed = json.loads(json_text)
        except Exception:
            print("[!] Sorry, I couldn't understand that command. Please check your API key or try again.")
            continue

        if parsed.get("intent") == "question":
            # FIX: We now inject the compressed_data and enforce strict AI rules.
            qa_prompt = f"""
            [PRE-CALCULATED SYSTEM METADATA]
            {compressed_data}
            
            [RAW FILE AND FOLDER LIST]
            {data_str}
            
            USER QUESTION: "{user_input}"
            
            CRITICAL INSTRUCTIONS FOR YOU (THE AI):
            1. LOOK AT THE PRE-CALCULATED METADATA FIRST! The 'Total Files' mathematically accounts for EVERY file in ALL subfolders. If they ask for the total number of files, you MUST use that number.
            2. By default, assume the user wants you to include ALL subfolders in your counts (recursive counting). Do NOT say "directly in the folder" unless they explicitly use words like "only in the root".
            3. If asked to count specific file types (e.g., PDFs), manually count them across the ENTIRE RAW LIST above.
            4. Be concise and mathematically accurate.
            """
            try:
                qa_response = model.generate_content(qa_prompt)
                print("\n[AI Answer]:")
                print(qa_response.text)
            except Exception as e:
                print(f"Error generating answer: {e}")

        elif parsed.get("intent") == "action" and parsed.get("action_type") == "move":
            handle_move_action(db, parsed.get("target_name"), parsed.get("destination_path"))
        
        else:
            print("Action parsed, but not currently supported. Try asking a question or moving a file.")
            
        input("\nPress Enter to continue...")

# ----------------------------------------------------------------------
# 4. ACTIONS
# ----------------------------------------------------------------------

def resolve_path(path_str):
    if path_str.lower() == "desktop":
        return os.path.join(os.path.expanduser("~"), "Desktop")
    if path_str.lower() == "documents":
        return os.path.join(os.path.expanduser("~"), "Documents")
    return path_str

def handle_move_action(db, target_name, destination_str):
    if not target_name or not destination_str:
        print("Missing target or destination in the command.")
        return

    destination = resolve_path(destination_str)
    print(f"\n[Action Requested] Move '{target_name}' to '{destination}'")
    
    matches = [item for item in db['folders'] + db['files'] if item['name'].lower() == target_name.lower()]
    
    if len(matches) == 0:
        print(f"Error: Could not find any file or folder named '{target_name}' in the analyzed directory.")
        return
        
    target_path = None
    
    if len(matches) == 1:
        target_path = matches[0]['path']
    else:
        print(f"\nFound {len(matches)} items matching '{target_name}'. Which one do you mean?")
        for i, match in enumerate(matches):
            kind = "Folder" if match['type'] == "folder" else "File"
            size_mb = match['size'] / (1024 * 1024)
            print(f"  [{i+1}] {kind}: {match['path']} ({size_mb:.2f} MB)")
            
        print("  [0] Cancel")
        choice = input(f"\nSelect a number (1-{len(matches)}): ").strip()
        
        if not choice.isdigit() or int(choice) == 0 or int(choice) > len(matches):
            print("Move cancelled.")
            return
            
        target_path = matches[int(choice)-1]['path']

    if not os.path.exists(target_path):
        print(f"Error: The path {target_path} no longer exists. You may need to run a new scan.")
        return
        
    try:
        os.makedirs(destination, exist_ok=True)
        print(f"Executing: Moving {target_path} -> {destination}")
        shutil.move(target_path, destination)
        print("Success! Note: You should re-scan this folder to update the local database.")
    except Exception as e:
        print(f"Failed to move: {e}")

# ----------------------------------------------------------------------
# STARTUP & MAIN MENU
# ----------------------------------------------------------------------

def main():
    clear_screen()
    config = load_config()
    
    if not config.get("api_key"):
        section("FIRST TIME SETUP: GEMINI API")
        print("To use the AI Assistant, please enter your Gemini API Key.")
        print("This will be saved permanently so you never have to type it again.")
        api_key = input("\nEnter API Key: ").strip()
        config["api_key"] = api_key
        save_config(config)
        clear_screen()
        
    genai.configure(api_key=config["api_key"])
    
    if not config.get("history"):
        section("FIRST TIME SETUP: TARGET FOLDER")
        print("I need a folder to analyze. Provide a full path (e.g. C:\\Users\\Me\\Documents)")
        path = input("\nEnter Folder Path: ").strip()
        scan_directory(path, config)
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
        print("  [1] Open AI Assistant (Query the Active Target)")
        print("  [2] Re-Scan Active Target (To update changes)")
        print("  [3] Scan a Brand New Folder")
        print("  [4] Switch to a Previously Scanned Folder")
        print("  [0] Exit")
        print("-" * 60)
        
        choice = input("Select an option: ").strip()
        
        if choice == "0":
            sys.exit(0)
            
        elif choice == "1":
            if db:
                ask_ai_assistant(db)
            else:
                print("\n[!] The database for this folder is missing. Please Re-Scan it (Option 2).")
                input("Press Enter to continue...")
                
        elif choice == "2":
            if active_path and active_path != "None":
                scan_directory(active_path, config)
            input("\nPress Enter to continue...")
            
        elif choice == "3":
            section("SCAN NEW FOLDER")
            path = input("Enter the full path of the new folder: ").strip()
            scan_directory(path, config)
            input("\nPress Enter to continue...")
            
        elif choice == "4":
            section("SWITCH ACTIVE FOLDER")
            history = config.get("history", [])
            if not history:
                print("No history available.")
            else:
                print("Previously scanned folders:")
                for i, p in enumerate(history):
                    print(f"  [{i+1}] {p}")
                print("  [0] Cancel")
                
                sel = input(f"\nSelect a folder (1-{len(history)}): ").strip()
                if sel.isdigit() and 0 < int(sel) <= len(history):
                    config["last_active"] = history[int(sel)-1]
                    save_config(config)
                    print(f"\nSwitched active target to: {config['last_active']}")
            input("\nPress Enter to continue...")

if __name__ == "__main__":
    main()