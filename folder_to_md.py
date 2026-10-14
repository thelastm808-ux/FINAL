#!/usr/bin/env python3
"""
folder_to_md.py

Drop this script inside a folder that contains several subfolders, run it,
and it will create ONE Markdown file per subfolder, each containing:
  1. that subfolder's file tree
  2. every file's name + its contents (in a code block)

Example:
    C:\\...\\ALL_PROGRAMS\\folder_to_md.py
    C:\\...\\ALL_PROGRAMS\\agent-zero-main\\
    C:\\...\\ALL_PROGRAMS\\LibreChat-main\\
    ... (12 more folders)

Running it produces:
    C:\\...\\ALL_PROGRAMS\\agent-zero-main_export.md
    C:\\...\\ALL_PROGRAMS\\LibreChat-main_export.md
    ... (one .md per subfolder, next to the script)

No folder picker, no prompts — it just uses the directory it's running
from. Works the same no matter which folder you put it in.

Optional: you can also pass a folder path as a command-line argument to
process subfolders of THAT folder instead of the script's own location:
    python folder_to_md.py "C:\\some\\other\\folder"
"""

import os
import sys

# Extensions we skip the content for (binary / not worth dumping)
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin",
    ".mp3", ".mp4", ".mov", ".avi", ".wav",
    ".pyc", ".class", ".o",
    ".woff", ".woff2", ".ttf", ".otf",
}

# Folders we don't want to walk into at all
SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv", ".idea", ".vscode"}

MAX_FILE_SIZE = 500_000  # bytes — skip dumping content of anything bigger than this


def build_tree(folder: str) -> str:
    """Simple indented tree, like the `tree` command."""
    lines = [os.path.basename(folder.rstrip(os.sep)) + "/"]

    def walk(dir_path, prefix=""):
        try:
            entries = sorted(os.listdir(dir_path))
        except PermissionError:
            return
        entries = [e for e in entries if e not in SKIP_DIRS]
        dirs = [e for e in entries if os.path.isdir(os.path.join(dir_path, e))]
        files = [e for e in entries if os.path.isfile(os.path.join(dir_path, e))]
        items = dirs + files

        for i, name in enumerate(items):
            is_last = i == len(items) - 1
            connector = "└── " if is_last else "├── "
            full_path = os.path.join(dir_path, name)
            is_dir = os.path.isdir(full_path)
            lines.append(f"{prefix}{connector}{name}{'/' if is_dir else ''}")
            if is_dir:
                extension = "    " if is_last else "│   "
                walk(full_path, prefix + extension)

    walk(folder)
    return "\n".join(lines)


def guess_lang(filename: str) -> str:
    """Rough extension -> markdown code-fence language mapping."""
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".tsx": "tsx", ".jsx": "jsx", ".java": "java", ".c": "c",
        ".cpp": "cpp", ".h": "c", ".hpp": "cpp", ".cs": "csharp",
        ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php",
        ".html": "html", ".css": "css", ".json": "json", ".xml": "xml",
        ".yml": "yaml", ".yaml": "yaml", ".md": "markdown", ".sql": "sql",
        ".sh": "bash", ".bat": "batch", ".kt": "kotlin", ".swift": "swift",
        ".txt": "text",
    }
    return mapping.get(ext, "")


def make_fence(content: str) -> str:
    """
    Markdown code fences only close on a fence of equal-or-greater length.
    If the file's own content contains a run of backticks (e.g. it's a .md
    file with code samples in it), a plain ``` wrapper gets closed early by
    that inner run, and everything after it stops rendering as code.
    So: find the longest run of backticks inside the content and make our
    wrapper one backtick longer than that (minimum 3).
    """
    longest = 0
    current = 0
    for ch in content:
        if ch == "`":
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return "`" * max(3, longest + 1)


def read_file_safe(path: str) -> str:
    size = os.path.getsize(path)
    if size > MAX_FILE_SIZE:
        return f"[skipped — file is {size:,} bytes, over the {MAX_FILE_SIZE:,} byte limit]"
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except (UnicodeDecodeError, PermissionError):
        return "[skipped — binary or unreadable file]"


def generate_markdown(folder: str) -> str:
    folder = os.path.abspath(folder)
    out = []

    out.append(f"# Folder Export: {os.path.basename(folder)}\n")
    out.append(f"Source path: `{folder}`\n")

    out.append("## File Structure\n")
    out.append("```")
    out.append(build_tree(folder))
    out.append("```\n")

    out.append("## File Contents\n")

    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        filenames = sorted(filenames)

        for fname in filenames:
            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(full_path, folder)
            ext = os.path.splitext(fname)[1].lower()

            out.append(f"### `{rel_path}`\n")

            if ext in SKIP_EXTENSIONS:
                out.append(f"*[skipped — {ext} file, binary content not dumped]*\n")
                continue

            content = read_file_safe(full_path)
            lang = guess_lang(fname)
            fence = make_fence(content)
            out.append(f"{fence}{lang}")
            out.append(content)
            out.append(f"{fence}\n")

    return "\n".join(out)


def get_base_folder() -> str:
    """
    The folder whose SUBFOLDERS we will each export.
    - If a path is given on the command line, use that.
    - Otherwise, use the folder this script itself lives in.
    """
    if len(sys.argv) > 1:
        return os.path.abspath(sys.argv[1])
    return os.path.dirname(os.path.abspath(__file__))


def main():
    base_folder = get_base_folder()

    if not os.path.isdir(base_folder):
        print(f"Not a folder: {base_folder}")
        sys.exit(1)

    # This script's own filename, so we never try to "process" ourselves
    # if it's ever placed oddly, and so we skip any *_export.md files
    # from a previous run sitting in the base folder.
    script_name = os.path.basename(os.path.abspath(__file__))

    subfolders = []
    for entry in sorted(os.listdir(base_folder)):
        full_path = os.path.join(base_folder, entry)
        if os.path.isdir(full_path) and entry not in SKIP_DIRS:
            subfolders.append(full_path)

    if not subfolders:
        print(f"No subfolders found in: {base_folder}")
        sys.exit(0)

    print(f"Base folder: {base_folder}")
    print(f"Found {len(subfolders)} subfolder(s). Generating one .md per subfolder...\n")

    for folder in subfolders:
        folder_name = os.path.basename(folder.rstrip(os.sep))
        output_path = os.path.join(base_folder, f"{folder_name}_export.md")

        print(f"  Processing '{folder_name}' ...", end=" ", flush=True)
        try:
            markdown = generate_markdown(folder)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown)
            print(f"done -> {os.path.basename(output_path)}")
        except Exception as e:
            print(f"FAILED ({e})")

    print(f"\nAll done. {len(subfolders)} markdown file(s) written to:\n{base_folder}")


if __name__ == "__main__":
    main()