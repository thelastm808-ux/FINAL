#!/usr/bin/env python3
"""
File & Folder Analysis Tool powered by LM Studio (local LLM)
v2 — Two-stage pipeline for EVERY query:
     1. Python gathers 100% accurate data from the scanned directory
     2. LM Studio receives that data + the user's question and replies
        in natural, conversational sentences — no raw dumps ever.
"""

import os
import json
import re
import sqlite3
import tempfile
import zipfile
import csv
from pathlib import Path
from collections import defaultdict
from datetime import datetime

import requests
import pdfplumber
from docx import Document as DocxDocument
from pptx import Presentation
import openpyxl

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
CONFIG_FILE = "lm_config.json"
DEFAULT_CONFIG = {
    "api_url": "http://localhost:1234/v1",
    "model": "google/gemma-3n-e4b",
    "max_context_length": 4000,
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    with open(CONFIG_FILE, "w") as f:
        json.dump(DEFAULT_CONFIG, f, indent=4)
    return DEFAULT_CONFIG

config     = load_config()
API_URL    = config["api_url"]
MODEL_NAME = config["model"]

# ─────────────────────────────────────────────────────────────────────────────
# LM Studio client
# ─────────────────────────────────────────────────────────────────────────────
def ask_llm(messages, temperature=0.4, max_tokens=600):
    url     = f"{API_URL}/chat/completions"
    payload = {
        "model":       MODEL_NAME,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
    }
    try:
        resp = requests.post(url, json=payload, timeout=120)
        resp.raise_for_status()
        data    = resp.json()
        content = data["choices"][0]["message"].get("content", "")
        # Fallback for reasoning-style models (DeepSeek, Qwen3, etc.)
        if not content.strip():
            reasoning = data["choices"][0]["message"].get("reasoning_content", "")
            if reasoning.strip():
                lines   = [l for l in reasoning.split("\n") if l.strip()]
                content = "\n".join(lines[-5:])
        return content.strip() if content.strip() else "❌ Model returned an empty response."
    except Exception as e:
        return f"❌ LM Studio error: {e}"


def llm_speak(user_question: str, data_context: str, max_tokens=600) -> str:
    """
    Core two-stage helper used by every command:
      - data_context  = exact facts Python extracted (never truncated, always correct)
      - user_question = what the user actually asked
    LM Studio's ONLY job is to phrase the answer naturally.
    """
    system = (
        "You are a helpful file-system assistant. "
        "You will be given EXACT data extracted directly from the user's directory — "
        "every number, path, and size is accurate. "
        "Your job is to answer the user's question in clear, friendly, conversational sentences "
        "using ONLY the data provided. Do not invent or guess anything. "
        "Do not add caveats about uncertainty. Just answer naturally and helpfully."
    )
    user_msg = (
        f"User's question: {user_question}\n\n"
        f"Exact directory data:\n{data_context}\n\n"
        "Please answer the user's question conversationally using the data above."
    )
    return ask_llm(
        [{"role": "system", "content": system},
         {"role": "user",   "content": user_msg}],
        temperature=0.4,
        max_tokens=max_tokens,
    )

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _hr(size_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"

def _time_ago(iso_str: str) -> str:
    """Convert an ISO timestamp to a human-readable 'X ago' string."""
    try:
        then = datetime.fromisoformat(iso_str)
        delta = datetime.now() - then
        secs = int(delta.total_seconds())
        if secs < 60:      return "just now"
        if secs < 3600:     return f"{secs // 60} min ago"
        if secs < 86400:    return f"{secs // 3600} hours ago"
        if secs < 604800:   return f"{secs // 86400} days ago"
        return then.strftime("%Y-%m-%d")
    except Exception:
        return iso_str

# ─────────────────────────────────────────────────────────────────────────────
# Persistent Storage (SQLite)
# ─────────────────────────────────────────────────────────────────────────────
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysis_history.db")

class StorageManager:
    """Persists scan data and query history to a local SQLite database."""

    def __init__(self):
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._create_tables()

    def _create_tables(self):
        c = self.conn
        c.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                directory_path TEXT    NOT NULL,
                root_name     TEXT    NOT NULL,
                scan_time     TEXT    NOT NULL,
                total_files   INTEGER NOT NULL,
                total_folders INTEGER NOT NULL,
                total_size    INTEGER NOT NULL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS scan_files (
                scan_id  INTEGER NOT NULL,
                path     TEXT    NOT NULL,
                relpath  TEXT    NOT NULL,
                name     TEXT    NOT NULL,
                size     INTEGER NOT NULL,
                mtime    TEXT    NOT NULL,
                ext      TEXT    NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES scans(id)
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS scan_folders (
                scan_id      INTEGER NOT NULL,
                abs_path     TEXT    NOT NULL,
                size_direct  INTEGER NOT NULL,
                count_direct INTEGER NOT NULL,
                rec_size     INTEGER NOT NULL,
                rec_count    INTEGER NOT NULL,
                subdirs_json TEXT    NOT NULL,
                extensions_json TEXT NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES scans(id)
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS query_history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id   INTEGER NOT NULL,
                question  TEXT    NOT NULL,
                answer    TEXT    NOT NULL,
                timestamp TEXT    NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES scans(id)
            )
        """)
        c.commit()

    # ── Save a scan ──────────────────────────────────────────────────────────
    def save_scan(self, scanner) -> int:
        """Save a Scanner's full state. Returns the scan_id."""
        now = datetime.now().isoformat()
        total_size = sum(f.size for f in scanner.files)

        # Delete old scan for same directory (keep only latest)
        old_ids = [r[0] for r in self.conn.execute(
            "SELECT id FROM scans WHERE directory_path = ?", (scanner.root,)
        ).fetchall()]
        for oid in old_ids:
            self.conn.execute("DELETE FROM scan_files   WHERE scan_id = ?", (oid,))
            self.conn.execute("DELETE FROM scan_folders WHERE scan_id = ?", (oid,))
            # Keep query_history — reparent to new scan later
        if old_ids:
            self.conn.execute("DELETE FROM scans WHERE directory_path = ?", (scanner.root,))

        cur = self.conn.execute(
            "INSERT INTO scans (directory_path, root_name, scan_time, total_files, total_folders, total_size) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (scanner.root, scanner.root_name, now,
             len(scanner.files), len(scanner.all_folders), total_size),
        )
        scan_id = cur.lastrowid

        # Reparent old query history to the new scan_id
        for oid in old_ids:
            self.conn.execute("UPDATE query_history SET scan_id = ? WHERE scan_id = ?", (scan_id, oid))

        # Batch-insert files
        self.conn.executemany(
            "INSERT INTO scan_files (scan_id, path, relpath, name, size, mtime, ext) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(scan_id, f.path, f.relpath, f.name, f.size, f.mtime, f.ext)
             for f in scanner.files],
        )

        # Batch-insert folders
        folder_rows = []
        for abs_path in scanner.all_folders:
            stats = scanner.folder_stats.get(abs_path, {})
            rec_sz, rec_cnt = scanner.recursive_stats(abs_path)
            folder_rows.append((
                scan_id, abs_path,
                stats.get("size_direct", 0), stats.get("count_direct", 0),
                rec_sz, rec_cnt,
                json.dumps(stats.get("subdirs", [])),
                json.dumps(stats.get("extensions", {})),
            ))
        self.conn.executemany(
            "INSERT INTO scan_folders "
            "(scan_id, abs_path, size_direct, count_direct, rec_size, rec_count, subdirs_json, extensions_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            folder_rows,
        )

        self.conn.commit()
        return scan_id

    # ── Load a saved scan into a Scanner ─────────────────────────────────────
    def load_scan(self, scan_id: int):
        """Reconstruct a Scanner from saved data. Returns (Scanner, scan_row) or (None, None)."""
        row = self.conn.execute(
            "SELECT id, directory_path, root_name, scan_time, total_files, total_folders, total_size "
            "FROM scans WHERE id = ?", (scan_id,)
        ).fetchone()
        if not row:
            return None, None

        scanner = Scanner.__new__(Scanner)
        scanner.root       = row[1]
        scanner.root_name  = row[2]
        scanner.files      = []
        scanner.folder_stats = {}
        scanner.all_folders = []
        scanner.duplicates  = {}
        scanner._rec_size   = {}
        scanner._rec_count  = {}

        # Load files
        name_map = defaultdict(list)
        for fr in self.conn.execute(
            "SELECT path, relpath, name, size, mtime, ext FROM scan_files WHERE scan_id = ?",
            (scan_id,)
        ).fetchall():
            fi = FileInfo(fr[0], fr[3], fr[4], fr[5])
            fi.relpath = fr[1]
            scanner.files.append(fi)
            name_map[fr[2].lower()].append(fr[1])

        scanner.duplicates = {n: ps for n, ps in name_map.items() if len(ps) > 1}

        # Load folders
        for fr in self.conn.execute(
            "SELECT abs_path, size_direct, count_direct, rec_size, rec_count, subdirs_json, extensions_json "
            "FROM scan_folders WHERE scan_id = ?", (scan_id,)
        ).fetchall():
            abs_path = fr[0]
            scanner.all_folders.append(abs_path)
            scanner.folder_stats[abs_path] = {
                "size_direct":  fr[1],
                "count_direct": fr[2],
                "extensions":   json.loads(fr[6]),
                "subdirs":      json.loads(fr[5]),
            }
            scanner._rec_size[abs_path]  = fr[3]
            scanner._rec_count[abs_path] = fr[4]

        return scanner, row

    # ── List saved scans ─────────────────────────────────────────────────────
    def list_scans(self):
        """Returns list of (id, directory_path, root_name, scan_time, total_files, total_folders, total_size)."""
        return self.conn.execute(
            "SELECT id, directory_path, root_name, scan_time, total_files, total_folders, total_size "
            "FROM scans ORDER BY scan_time DESC"
        ).fetchall()

    def get_scan_id_for_path(self, directory_path: str):
        """Get the scan ID for a previously scanned directory path, or None."""
        row = self.conn.execute(
            "SELECT id FROM scans WHERE directory_path = ?", (directory_path,)
        ).fetchone()
        return row[0] if row else None

    # ── Query history ────────────────────────────────────────────────────────
    def save_query(self, scan_id: int, question: str, answer: str):
        self.conn.execute(
            "INSERT INTO query_history (scan_id, question, answer, timestamp) VALUES (?, ?, ?, ?)",
            (scan_id, question, answer, datetime.now().isoformat()),
        )
        self.conn.commit()

    def get_history(self, scan_id: int = None, limit: int = 20):
        """Get query history. If scan_id is None, returns across all scans."""
        if scan_id is not None:
            return self.conn.execute(
                "SELECT qh.question, qh.answer, qh.timestamp, s.root_name "
                "FROM query_history qh JOIN scans s ON qh.scan_id = s.id "
                "WHERE qh.scan_id = ? ORDER BY qh.timestamp DESC LIMIT ?",
                (scan_id, limit),
            ).fetchall()
        else:
            return self.conn.execute(
                "SELECT qh.question, qh.answer, qh.timestamp, s.root_name "
                "FROM query_history qh JOIN scans s ON qh.scan_id = s.id "
                "ORDER BY qh.timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()

    def clear_history(self, scan_id: int):
        self.conn.execute("DELETE FROM query_history WHERE scan_id = ?", (scan_id,))
        self.conn.commit()

    def close(self):
        self.conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# File info
# ─────────────────────────────────────────────────────────────────────────────
class FileInfo:
    __slots__ = ("path", "relpath", "name", "size", "mtime", "ext")

    def __init__(self, path, size, mtime, ext):
        self.path    = path
        self.relpath = None
        self.name    = os.path.basename(path)
        self.size    = size
        self.mtime   = mtime
        self.ext     = ext.lower()

# ─────────────────────────────────────────────────────────────────────────────
# Directory scanner
# ─────────────────────────────────────────────────────────────────────────────
class Scanner:
    def __init__(self, root: str):
        self.root       = os.path.abspath(root)
        self.root_name  = os.path.basename(self.root) or self.root
        self.files:     list  = []
        self.folder_stats: dict = {}   # abs_path → {size_direct, count_direct, extensions, subdirs}
        self.all_folders: list  = []
        self.duplicates:  dict  = {}
        self._rec_size:  dict  = {}    # pre-computed recursive sizes
        self._rec_count: dict  = {}    # pre-computed recursive file counts

    # ── Scan ─────────────────────────────────────────────────────────────────
    def scan(self):
        print(f"🔍 Scanning {self.root} …")
        name_map: dict = defaultdict(list)

        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames.sort()
            self.all_folders.append(dirpath)
            dir_size = dir_count = 0
            dir_ext: dict = defaultdict(int)

            for fname in filenames:
                full = os.path.join(dirpath, fname)
                try:
                    st    = os.stat(full)
                    fsize = st.st_size
                    fmtime = datetime.fromtimestamp(st.st_mtime).isoformat()
                except OSError:
                    continue
                ext = os.path.splitext(fname)[1].lower()
                fi  = FileInfo(full, fsize, fmtime, ext)
                fi.relpath = os.path.relpath(full, self.root)
                self.files.append(fi)
                dir_size  += fsize
                dir_count += 1
                dir_ext[ext if ext else "(no ext)"] += 1
                name_map[fname.lower()].append(fi.relpath)

            self.folder_stats[dirpath] = {
                "size_direct":  dir_size,
                "count_direct": dir_count,
                "extensions":   dict(dir_ext),
                "subdirs":      [os.path.join(dirpath, d) for d in dirnames],
            }

        self.duplicates = {n: ps for n, ps in name_map.items() if len(ps) > 1}
        self._compute_recursive_sizes()
        print(f"✅ Found {len(self.files):,} files in {len(self.folder_stats):,} folders.")

    # ── Pre-compute recursive sizes (O(n) once, then O(1) per lookup) ─────
    def _compute_recursive_sizes(self):
        """Walk every file and credit its size to every ancestor folder."""
        self._rec_size  = {f: 0 for f in self.all_folders}
        self._rec_count = {f: 0 for f in self.all_folders}
        for fi in self.files:
            parent = os.path.dirname(fi.path)
            while parent and len(parent) >= len(self.root):
                if parent in self._rec_size:
                    self._rec_size[parent]  += fi.size
                    self._rec_count[parent] += 1
                if parent == self.root:
                    break
                parent = os.path.dirname(parent)


    # ── Folder resolution ─────────────────────────────────────────────────────
    def resolve_folder(self, name_or_path: str):
        if not name_or_path:
            return None
        if os.path.isabs(name_or_path) and name_or_path in self.folder_stats:
            return name_or_path
        candidate = os.path.normpath(os.path.join(self.root, name_or_path))
        if candidate in self.folder_stats:
            return candidate
        needle = name_or_path.lower().strip("/\\")
        # exact basename match
        matches = [p for p in self.all_folders if os.path.basename(p).lower() == needle]
        if matches:
            return sorted(matches, key=lambda p: p.count(os.sep))[0]
        # partial basename match
        matches = [p for p in self.all_folders if needle in os.path.basename(p).lower()]
        if matches:
            return sorted(matches, key=lambda p: p.count(os.sep))[0]
        return None

    # ── Recursive stats ───────────────────────────────────────────────────────
    def recursive_stats(self, folder_abs: str):
        # Use pre-computed values if available (O(1) lookup)
        if folder_abs in self._rec_size:
            return self._rec_size[folder_abs], self._rec_count[folder_abs]
        # Fallback: scan all files (includes files directly in folder + sub-dirs)
        prefix = folder_abs.rstrip(os.sep) + os.sep
        size = count = 0
        for f in self.files:
            if f.path.startswith(prefix) or os.path.dirname(f.path) == folder_abs:
                size  += f.size
                count += 1
        return size, count

    def files_in_folder(self, folder_abs: str, recursive=False):
        prefix = folder_abs.rstrip(os.sep) + os.sep
        results = []
        for f in self.files:
            if recursive:
                # Include files directly in folder AND in all sub-directories
                if f.path.startswith(prefix) or os.path.dirname(f.path) == folder_abs:
                    results.append(f)
            else:
                if os.path.dirname(f.path) == folder_abs:
                    results.append(f)
        return results

    # ── Stats helpers ─────────────────────────────────────────────────────────
    def largest_files(self, n=10, folder_abs=None):
        pool = self.files if folder_abs is None else self.files_in_folder(folder_abs, recursive=True)
        return sorted(pool, key=lambda f: f.size, reverse=True)[:n]

    def largest_folders(self, n=10):
        sizes = [(p, self.recursive_stats(p)[0]) for p in self.all_folders]
        return sorted(sizes, key=lambda x: x[1], reverse=True)[:n]

    def file_type_breakdown(self, folder_abs=None):
        pool   = self.files if folder_abs is None else self.files_in_folder(folder_abs, recursive=True)
        counts: dict = defaultdict(int)
        for f in pool:
            counts[f.ext if f.ext else "(no ext)"] += 1
        total = sum(counts.values()) or 1
        return dict(sorted(
            {e: (c, round(c / total * 100, 1)) for e, c in counts.items()}.items(),
            key=lambda x: x[1][0], reverse=True,
        ))

    def search_files(self, name=None, ext=None, keyword=None):
        if ext and not ext.startswith("."):
            ext = "." + ext
        results = []
        for f in self.files:
            if name    and name.lower()    not in f.name.lower():      continue
            if ext     and f.ext           != ext.lower():             continue
            if keyword and keyword.lower() not in f.relpath.lower():   continue
            results.append(f)
        return results

    # ── Compact structured summary for the LLM ────────────────────────────────
    def directory_fact_sheet(self) -> str:
        total_size = sum(f.size for f in self.files)
        top_subdirs = self.folder_stats.get(self.root, {}).get("subdirs", [])

        lines = [
            f"Root directory  : {self.root_name}",
            f"Full path       : {self.root}",
            f"Total files     : {len(self.files):,}",
            f"Total folders   : {len(self.all_folders):,}",
            f"Total size      : {_hr(total_size)}",
            "",
            f"Direct sub-folders of '{self.root_name}' ({len(top_subdirs)} folders):",
        ]
        for sf in top_subdirs:
            sz, cnt = self.recursive_stats(sf)
            lines.append(f"  - {os.path.basename(sf)}/  →  {cnt:,} files, {_hr(sz)}")

        bd = self.file_type_breakdown()
        lines += ["", "File-type distribution (top 10):"]
        for ext, (cnt, pct) in list(bd.items())[:10]:
            lines.append(f"  - {ext}: {cnt:,} files  ({pct}%)")

        top5 = self.largest_files(5)
        lines += ["", "Top 5 largest files:"]
        for f in top5:
            lines.append(f"  - {f.relpath}  ({_hr(f.size)})")

        if self.duplicates:
            sample = list(self.duplicates.keys())[:5]
            lines += ["", f"Duplicate filenames (sample): {', '.join(sample)}"]

        return "\n".join(lines)

# ─────────────────────────────────────────────────────────────────────────────
# Document analyser (content extraction + LM Studio summary)
# ─────────────────────────────────────────────────────────────────────────────
class DocumentAnalyzer:
    WORD_THRESHOLD = 100

    def analyze(self, filepath: str) -> str:
        ext = os.path.splitext(filepath)[1].lower()
        return {
            ".pdf":  self._pdf,
            ".docx": self._docx,
            ".doc":  lambda p: "⚠️  Old .doc format not supported for content analysis.",
            ".pptx": self._pptx,
            ".xlsx": self._xlsx,
            ".csv":  self._csv,
            ".zip":  self._zip,
        }.get(ext, lambda p: "ℹ️  File type not supported for content analysis.")(filepath)

    def _wc(self, text: str) -> int:
        return len(text.split())

    def _summarise(self, content: str, kind: str) -> str:
        prompt = (
            f"You are given the opening portion of a {kind}. "
            "In 3 to 5 clear sentences, explain what this document is about, "
            "what it contains, and who it might be intended for.\n\n"
            f"CONTENT:\n{content}\n\nSUMMARY:"
        )
        return ask_llm([{"role": "user", "content": prompt}], temperature=0.3, max_tokens=300)

    def _pdf(self, path):
        try:
            with pdfplumber.open(path) as pdf:
                n    = len(pdf.pages)
                text = "".join((pdf.pages[i].extract_text() or "") + "\n" for i in range(min(2, n)))
                if self._wc(text) < self.WORD_THRESHOLD and n > 2:
                    text += "".join((pdf.pages[i].extract_text() or "") + "\n" for i in range(2, min(4, n)))
                return self._summarise(text, "PDF document")
        except Exception as e:
            return f"❌ PDF error: {e}"

    def _docx(self, path):
        try:
            doc   = DocxDocument(path)
            words = " ".join(p.text for p in doc.paragraphs if p.text.strip()).split()
            tier  = " ".join(words[:600]) if self._wc(" ".join(words[:600])) >= self.WORD_THRESHOLD else " ".join(words[:1200])
            return self._summarise(tier, "Word document")
        except Exception as e:
            return f"❌ DOCX error: {e}"

    def _pptx(self, path):
        try:
            prs = Presentation(path)
            def slide_text(s):
                return " ".join(
                    p.text.strip()
                    for shape in s.shapes if shape.has_text_frame
                    for p in shape.text_frame.paragraphs if p.text.strip()
                )
            texts = [slide_text(s) for s in prs.slides]
            tier  = " ".join(texts[:2])
            if self._wc(tier) < 50:
                tier = " ".join(texts[:4])
            return self._summarise(tier, "PowerPoint presentation")
        except Exception as e:
            return f"❌ PPTX error: {e}"

    def _xlsx(self, path):
        try:
            wb        = openpyxl.load_workbook(path, data_only=True, read_only=True)
            collected = ""
            used      = 0
            for sheet_name in wb.sheetnames:
                if used >= 2:
                    break
                ws   = wb[sheet_name]
                rows = [
                    " | ".join(str(v) if v is not None else "" for v in row)
                    for i, row in enumerate(ws.iter_rows(max_row=50, values_only=True))
                    if not (i == 0 and all(v is None for v in row))
                ]
                content = "\n".join(rows)
                if content.strip():
                    collected += f"--- Sheet: {sheet_name} ---\n{content}\n"
                    used += 1
            return self._summarise(collected, "Excel spreadsheet") if collected.strip() else "ℹ️  Spreadsheet appears empty."
        except Exception as e:
            return f"❌ XLSX error: {e}"

    def _csv(self, path):
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                rows = [" | ".join(row) for i, row in enumerate(csv.reader(f)) if i < 50]
            content = "\n".join(rows)
            return self._summarise(content, "CSV spreadsheet") if content.strip() else "ℹ️  CSV file is empty."
        except Exception as e:
            return f"❌ CSV error: {e}"

    def _zip(self, path):
        try:
            with zipfile.ZipFile(path, "r") as zf:
                infos   = zf.infolist()
                total   = len(infos)
                uncomp  = sum(i.file_size for i in infos)
                ext_cnt: dict = defaultdict(int)
                largest = None
                lsize   = 0
                for info in infos:
                    if info.is_dir():
                        continue
                    ext = os.path.splitext(info.filename)[1].lower()
                    ext_cnt[ext or "(no ext)"] += 1
                    if info.file_size > lsize:
                        lsize   = info.file_size
                        largest = info.filename

                type_str = ", ".join(f"{v} {k}" for k, v in ext_cnt.items())
                struct   = (
                    f"ZIP contains {total} files totalling {_hr(uncomp)} uncompressed.\n"
                    f"File types inside: {type_str}.\n"
                    f"Largest file: {largest} ({_hr(lsize)})."
                )

                supported = {".pdf", ".docx", ".pptx", ".xlsx", ".csv"}
                peek = next((i.filename for i in infos
                             if os.path.splitext(i.filename)[1].lower() in supported), None)
                content_summary = ""
                if peek:
                    with tempfile.TemporaryDirectory() as tmp:
                        ep = zf.extract(peek, tmp)
                        content_summary = f"\nContent of first document ({peek}):\n{DocumentAnalyzer().analyze(ep)}"

                # Let LM Studio phrase this naturally
                data = struct + content_summary
                prompt = (
                    "Given the following information about a ZIP archive, write a natural 3-5 sentence "
                    "description of what it contains and what it appears to be for.\n\n"
                    f"DATA:\n{data}\n\nDESCRIPTION:"
                )
                return ask_llm([{"role": "user", "content": prompt}], temperature=0.4, max_tokens=250)
        except Exception as e:
            return f"❌ ZIP error: {e}"

# ─────────────────────────────────────────────────────────────────────────────
# Interactive shell
# ─────────────────────────────────────────────────────────────────────────────
class InteractiveShell:
    def __init__(self):
        self.scanner   = None
        self.analyzer  = DocumentAnalyzer()
        self.storage   = StorageManager()
        self.scan_id   = None   # current scan's ID in the database

    # ── Helper: print answer and auto-save to history ─────────────────────────
    def _respond(self, query: str, answer: str):
        """Print the answer and persist the Q&A pair."""
        print(f"\n\U0001f916 {answer}\n")
        if self.scan_id is not None:
            self.storage.save_query(self.scan_id, query, answer)

    # ── Main loop ─────────────────────────────────────────────────────────────
    def run(self):
        print("\n\U0001f4c1 File & Folder Analyzer (powered by LM Studio)")
        print("Type 'help' for commands, 'quit' to exit.\n")

        # Show previously saved scans
        saved = self.storage.list_scans()
        if saved:
            print("\U0001f4e6 Previously scanned directories:")
            for i, row in enumerate(saved, 1):
                sid, dpath, rname, stime, tfiles, tfolders, tsize = row
                print(f"  {i}. {dpath}")
                print(f"     ({tfiles:,} files, {_hr(tsize)}, scanned {_time_ago(stime)})")
            print(f"\n  Enter a number (1-{len(saved)}) to load a saved scan,")
            print("  or type a directory path to scan fresh.\n")

        while True:
            dir_path = input("\U0001f4c2 Enter directory path or number: ").strip()
            if dir_path.lower() in ("quit", "exit"):
                self.storage.close()
                return

            # Check if user entered a number to load saved scan
            if dir_path.isdigit() and saved:
                idx = int(dir_path) - 1
                if 0 <= idx < len(saved):
                    chosen = saved[idx]
                    print(f"\n\u23f3 Loading saved scan of '{chosen[2]}' ...")
                    self.scanner, scan_row = self.storage.load_scan(chosen[0])
                    if self.scanner:
                        self.scan_id = chosen[0]
                        print(f"\u2705 Loaded! (scanned {_time_ago(chosen[3])})")
                        break
                    else:
                        print("\u274c Failed to load saved scan. Please enter a path.\n")
                        continue
                else:
                    print(f"\u274c Please enter a number between 1 and {len(saved)}.\n")
                    continue

            if not os.path.isdir(dir_path):
                print("\u274c Invalid directory. Try again.\n")
                continue

            abs_path = os.path.abspath(dir_path)

            # Check if this directory was previously scanned
            existing_id = self.storage.get_scan_id_for_path(abs_path)
            if existing_id:
                choice = input("\U0001f504 This directory was scanned before. Load saved (L) or rescan (R)? ").strip().lower()
                if choice in ("l", "load", ""):
                    print(f"\n\u23f3 Loading saved scan ...")
                    self.scanner, scan_row = self.storage.load_scan(existing_id)
                    if self.scanner:
                        self.scan_id = existing_id
                        print(f"\u2705 Loaded! (scanned {_time_ago(scan_row[3])})")
                        break

            # Fresh scan
            self.scanner = Scanner(abs_path)
            self.scanner.scan()
            print("\U0001f4be Saving scan to database ...")
            self.scan_id = self.storage.save_scan(self.scanner)
            print("\u2705 Saved!")
            break

        self._print_overview()
        print("\nAsk me anything about the directory or ask me to summarize a file.")
        print("Type 'history' to see past Q&A, 'help' for all commands.\n")

        while True:
            try:
                user_input = input("\U0001f4ac > ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\n\U0001f44b Goodbye.")
                break
            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit"):
                print("\U0001f44b Goodbye.")
                break
            if user_input.lower() == "help":
                self._print_help()
                continue
            self._dispatch(user_input)

    # ── One-time overview on startup ──────────────────────────────────────────
    def _print_overview(self):
        s  = self.scanner
        ts = sum(f.size for f in s.files)
        print(f"\n📊 Directory Overview — '{s.root_name}'")
        print(f"   Path         : {s.root}")
        print(f"   Total files  : {len(s.files):,}")
        print(f"   Total folders: {len(s.all_folders):,}")
        print(f"   Total size   : {_hr(ts)}")

        top_subdirs = s.folder_stats.get(s.root, {}).get("subdirs", [])
        if top_subdirs:
            print(f"\n   📁 Direct sub-folders ({len(top_subdirs)}):")
            for sf in sorted(top_subdirs):
                sz, cnt = s.recursive_stats(sf)
                print(f"      • {os.path.basename(sf)}/  ({cnt:,} files, {_hr(sz)})")

        bd = s.file_type_breakdown()
        if bd:
            print(f"\n   📂 Top file types:")
            for ext, (cnt, pct) in list(bd.items())[:6]:
                print(f"      • {ext or '(no ext)'}: {cnt:,} files  ({pct}%)")

    # ── Dispatcher — keyword-based, all paths feed llm_speak() ───────────────
    def _dispatch(self, query: str):
        q = query.lower()

        # ── Built-in management commands (no LLM needed) ─────────────────────
        if q in ("history",) or q.startswith("history "):
            self._cmd_history(query); return

        if q in ("past scans", "saved scans", "scans", "list scans"):
            self._cmd_past_scans(); return

        if q in ("scan new", "new scan"):
            self._cmd_scan_new(); return

        if q == "rescan":
            self._cmd_rescan(); return

        if q in ("clear history", "delete history"):
            self._cmd_clear_history(); return

        if q.startswith("load ") or q.startswith("switch "):
            self._cmd_load(query); return

        # ── Analysis queries ─────────────────────────────────────────────────
        if any(k in q for k in ("subfolder", "sub folder", "sub-folder", "subdirectory",
                                 "list folder", "list all folder", "show folder",
                                 "what folder", "which folder", "give me the list",
                                 "all folder", "folders under", "folders in",
                                 "folders inside", "show me folder", "show me all",
                                 "give me the folders", "show me the folders",
                                 "what are the folder", "how many folder")):
            self._q_subfolders(query); return

        if any(k in q for k in ("where is", "where's", "locate ", "path of", "location of")):
            self._q_find(query); return

        if any(k in q for k in ("list files", "files in ", "files inside",
                                  "show files", "what files", "files under",
                                  "what are the files")):
            self._q_list_files(query); return

        if any(k in q for k in ("how many", "count ", "number of")):
            self._q_count(query); return

        if any(k in q for k in ("biggest", "largest", "heaviest", "top file",
                                  "top folder", "what is the biggest", "what is the largest")):
            self._q_largest(query); return

        if any(k in q for k in ("total size", "size of", "how big", "disk space",
                                 "how large", "how much space", "how much does")):
            self._q_size(query); return

        if any(k in q for k in ("type breakdown", "file type", "what type", "extension",
                                  "distribution", "what kinds")):
            self._q_type_breakdown(query); return

        if "duplicate" in q:
            self._q_duplicates(query); return

        if any(k in q for k in ("analyze ", "analyse ", "summarize ", "summarise ",
                                  "summary of", "content of", "what is in", "what does",
                                  "tell me about the file", "read the file")):
            if self._q_analyze(query):
                return

        if any(k in q for k in ("search", "filter", "find ")):
            self._q_search(query); return

        # Final fallback: give LLM the full fact sheet
        self._q_general(query)

    # ─────────────────────────────────────────────────────────────────────────
    # Management commands (history, scans, load, rescan)
    # ─────────────────────────────────────────────────────────────────────────

    def _cmd_history(self, query: str):
        q = query.lower().strip()
        if q == "history all":
            rows = self.storage.get_history(scan_id=None, limit=30)
            label = "all directories"
        else:
            rows = self.storage.get_history(scan_id=self.scan_id, limit=20)
            label = self.scanner.root_name

        if not rows:
            print(f"\n\U0001f4ad No query history yet for {label}.\n")
            return

        print(f"\n\U0001f4dc Query History — {label} ({len(rows)} entries):\n")
        for i, (question, answer, ts, rname) in enumerate(reversed(rows), 1):
            time_str = _time_ago(ts)
            dir_tag  = f" [{rname}]" if q == "history all" else ""
            print(f"  {i}. \U0001f4ac {question}{dir_tag}  ({time_str})")
            # Show first 120 chars of answer
            short = answer[:120].replace("\n", " ")
            if len(answer) > 120:
                short += "..."
            print(f"     \U0001f916 {short}")
            print()

    def _cmd_past_scans(self):
        saved = self.storage.list_scans()
        if not saved:
            print("\n\U0001f4ad No saved scans yet.\n")
            return

        print(f"\n\U0001f4e6 All saved scans ({len(saved)} total):\n")
        for i, row in enumerate(saved, 1):
            sid, dpath, rname, stime, tfiles, tfolders, tsize = row
            marker = " \u2190 current" if sid == self.scan_id else ""
            print(f"  {i}. {dpath}{marker}")
            print(f"     {tfiles:,} files, {tfolders:,} folders, {_hr(tsize)} — scanned {_time_ago(stime)}")
            # Show how many queries were asked
            qcount = len(self.storage.get_history(scan_id=sid, limit=9999))
            if qcount:
                print(f"     {qcount} question(s) in history")
            print()

    def _cmd_scan_new(self):
        """Scan a new directory and switch to it."""
        while True:
            dir_path = input("\U0001f4c2 Enter new directory path to scan: ").strip()
            if dir_path.lower() in ("quit", "exit", "cancel", ""):
                print("Cancelled.\n")
                return
            if not os.path.isdir(dir_path):
                print("\u274c Invalid directory. Try again.\n")
                continue
            break

        self.scanner = Scanner(os.path.abspath(dir_path))
        self.scanner.scan()
        print("\U0001f4be Saving scan to database ...")
        self.scan_id = self.storage.save_scan(self.scanner)
        print("\u2705 Saved!")
        self._print_overview()
        print()

    def _cmd_rescan(self):
        """Re-scan the current directory and update the database."""
        if not self.scanner:
            print("\u274c No directory loaded.\n")
            return
        print(f"\U0001f504 Re-scanning {self.scanner.root} ...")
        self.scanner = Scanner(self.scanner.root)
        self.scanner.scan()
        print("\U0001f4be Saving updated scan ...")
        self.scan_id = self.storage.save_scan(self.scanner)
        print("\u2705 Updated!")
        self._print_overview()
        print()

    def _cmd_load(self, query: str):
        """Load a previously saved scan by path or number."""
        arg = re.sub(r'^(load|switch)\s+', '', query, flags=re.IGNORECASE).strip()

        saved = self.storage.list_scans()
        if not saved:
            print("\U0001f4ad No saved scans to load.\n")
            return

        # Try as a number
        if arg.isdigit():
            idx = int(arg) - 1
            if 0 <= idx < len(saved):
                chosen = saved[idx]
            else:
                print(f"\u274c Please enter a number between 1 and {len(saved)}.\n")
                return
        else:
            # Try as a path or name match
            abs_arg = os.path.abspath(arg) if not os.path.isabs(arg) else arg
            chosen = None
            for row in saved:
                if row[1] == abs_arg or row[2].lower() == arg.lower():
                    chosen = row
                    break
            if not chosen:
                print(f"\u274c No saved scan found matching '{arg}'. Type 'past scans' to see available.\n")
                return

        print(f"\n\u23f3 Loading saved scan of '{chosen[2]}' ...")
        self.scanner, scan_row = self.storage.load_scan(chosen[0])
        if self.scanner:
            self.scan_id = chosen[0]
            print(f"\u2705 Loaded! (scanned {_time_ago(chosen[3])})")
            self._print_overview()
            print()
        else:
            print("\u274c Failed to load saved scan.\n")

    def _cmd_clear_history(self):
        if self.scan_id is None:
            print("\u274c No active scan.\n")
            return
        self.storage.clear_history(self.scan_id)
        print(f"\u2705 Query history cleared for '{self.scanner.root_name}'.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # Query handlers — each builds a precise data_context then calls llm_speak
    # ─────────────────────────────────────────────────────────────────────────

    def _q_subfolders(self, query: str):
        folder_name = self._extract_folder(query)
        target_abs  = self.scanner.resolve_folder(folder_name) if folder_name else self.scanner.root

        if target_abs is None:
            print(f"🤖 I couldn't find a folder called '{folder_name}' in the scan.\n")
            return

        subdirs  = self.scanner.folder_stats.get(target_abs, {}).get("subdirs", [])
        rel      = os.path.relpath(target_abs, self.scanner.root) if target_abs != self.scanner.root else self.scanner.root_name
        want_all = any(k in query.lower() for k in ("all", "every", "recursive", "nested", "complete"))

        if not subdirs:
            # Small / empty — LLM is fine
            data_context = (
                f"The folder being queried is: '{rel}' (inside '{self.scanner.root_name}').\n"
                "This folder has NO sub-folders."
            )
            print(f"\n🤖 {llm_speak(query, data_context)}\n")
            return

        if want_all:
            # ── Collect every folder up to 4 levels deep ──────────────────────
            rows = []
            for folder_abs in sorted(self.scanner.all_folders):
                if folder_abs == self.scanner.root:
                    continue
                if not folder_abs.startswith(target_abs + os.sep) and folder_abs != target_abs:
                    continue
                rel_path = os.path.relpath(folder_abs, target_abs)
                depth    = len(Path(rel_path).parts)
                if depth > 4:
                    continue
                sz, cnt  = self.scanner.recursive_stats(folder_abs)
                indent   = "  " * depth
                rows.append((depth, f"{indent}📁 {os.path.basename(folder_abs)}/  "
                                    f"({cnt:,} files, {_hr(sz)})"))

            # ── Print directly — never trust LLM with 100s of folder names ───
            print(f"\n📂 All sub-folders of '{rel}' ({len(rows)} shown, up to 4 levels deep):\n")
            for _, line in rows:
                print(f"  {line}")
            print()

        else:
            # Direct children only — small enough for LLM
            DIRECT_LIMIT = 40   # above this, also print directly
            if len(subdirs) <= DIRECT_LIMIT:
                lines = [f"Direct sub-folders of '{rel}' ({len(subdirs)} total):"]
                for sf in sorted(subdirs):
                    sz, cnt = self.scanner.recursive_stats(sf)
                    lines.append(f"  - {os.path.basename(sf)}/  →  {cnt:,} files, {_hr(sz)}")
                data_context = "\n".join(lines)
                print(f"\n🤖 {llm_speak(query, data_context, max_tokens=800)}\n")
            else:
                print(f"\n📂 Direct sub-folders of '{rel}' ({len(subdirs)} total):\n")
                for sf in sorted(subdirs):
                    sz, cnt = self.scanner.recursive_stats(sf)
                    print(f"  📁 {os.path.basename(sf)}/  ({cnt:,} files, {_hr(sz)})")
                print()

    def _q_find(self, query: str):
        q = re.sub(r"\b(where is|where's|locate|path of|location of)\b", "",
                   query, flags=re.IGNORECASE).strip().strip("?'\" ")
        results = self.scanner.search_files(name=q) if q else []

        if results:
            lines = [f"Search results for '{q}' ({len(results)} match(es) found):"]
            for f in results[:15]:
                lines.append(f"  - {f.relpath}  (size: {_hr(f.size)}, modified: {f.mtime[:10]})")
            if len(results) > 15:
                lines.append(f"  … and {len(results)-15} more matches.")
        else:
            lines = [f"No file matching '{q}' was found anywhere in '{self.scanner.root_name}'."]

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_list_files(self, query: str):
        folder_name = self._extract_folder(query)
        if not folder_name:
            self._q_general(query); return

        abs_path = self.scanner.resolve_folder(folder_name)
        if not abs_path:
            data = f"No folder called '{folder_name}' was found in '{self.scanner.root_name}'."
            print(f"\n🤖 {llm_speak(query, data)}\n"); return

        recursive = any(k in query.lower() for k in ("all", "recursive", "including sub"))
        files     = self.scanner.files_in_folder(abs_path, recursive=recursive)
        rel       = os.path.relpath(abs_path, self.scanner.root)

        lines = [
            f"Contents of folder '{rel}' ({'recursive' if recursive else 'direct files only'})",
            f"Total files: {len(files):,}",
        ]
        for f in sorted(files, key=lambda x: x.name.lower())[:40]:
            lines.append(f"  - {f.name}  ({_hr(f.size)})")
        if len(files) > 40:
            lines.append(f"  … and {len(files)-40} more files.")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_count(self, query: str):
        q   = query.lower()
        ext = self._extract_ext(q)
        folder_name = self._extract_folder(query)
        abs_folder  = self.scanner.resolve_folder(folder_name) if folder_name else None
        prefix = abs_folder.rstrip(os.sep) + os.sep if abs_folder else None

        lines = []
        if ext:
            results = self.scanner.search_files(ext=ext)
            if prefix:
                results = [f for f in results if f.path.startswith(prefix)]
            loc = f"in '{folder_name}'" if abs_folder else f"in '{self.scanner.root_name}'"
            lines.append(f"Number of {ext.upper()} files {loc}: {len(results):,}")
            if 0 < len(results) <= 10:
                for f in results:
                    lines.append(f"  - {f.relpath}")
        else:
            if abs_folder:
                sz, cnt = self.scanner.recursive_stats(abs_folder)
                rel = os.path.relpath(abs_folder, self.scanner.root)
                lines.append(f"Folder '{rel}' contains {cnt:,} files ({_hr(sz)} total size).")
            else:
                ts = sum(f.size for f in self.scanner.files)
                lines.append(
                    f"'{self.scanner.root_name}' contains {len(self.scanner.files):,} files "
                    f"across {len(self.scanner.all_folders):,} folders ({_hr(ts)} total)."
                )

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_largest(self, query: str):
        q = query.lower()
        lines = []
        if "folder" in q or "director" in q:
            top = self.scanner.largest_folders(10)
            lines.append(f"Largest folders in '{self.scanner.root_name}' by total (recursive) size:")
            for abs_path, sz in top:
                rel  = os.path.relpath(abs_path, self.scanner.root) if abs_path != self.scanner.root else "."
                _, cnt = self.scanner.recursive_stats(abs_path)
                lines.append(f"  - {rel}/  →  {_hr(sz)}  ({cnt:,} files)")
        else:
            folder_name = self._extract_folder(query)
            abs_folder  = self.scanner.resolve_folder(folder_name) if folder_name else None
            top         = self.scanner.largest_files(10, folder_abs=abs_folder)
            loc = f"in '{folder_name}'" if abs_folder else f"in '{self.scanner.root_name}'"
            lines.append(f"Largest files {loc}:")
            for f in top:
                lines.append(f"  - {f.relpath}  →  {_hr(f.size)}")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_size(self, query: str):
        folder_name = self._extract_folder(query)
        lines = []
        if folder_name:
            # If user named the root folder explicitly, use root totals
            if folder_name.lower() == self.scanner.root_name.lower():
                sz, cnt = self.scanner.recursive_stats(self.scanner.root)
                lines.append(f"Total size of '{self.scanner.root_name}': {_hr(sz)}  ({cnt:,} files).")
            else:
                abs_path = self.scanner.resolve_folder(folder_name)
                if abs_path:
                    sz, cnt = self.scanner.recursive_stats(abs_path)
                    rel = os.path.relpath(abs_path, self.scanner.root)
                    lines.append(f"Size of '{rel}': {_hr(sz)}  ({cnt:,} files inside).")
                else:
                    lines.append(f"No folder called '{folder_name}' found in '{self.scanner.root_name}'.")
        else:
            sz, cnt = self.scanner.recursive_stats(self.scanner.root)
            lines.append(f"Total size of '{self.scanner.root_name}': {_hr(sz)}  ({cnt:,} files).")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_type_breakdown(self, query: str):
        folder_name = self._extract_folder(query)
        abs_folder  = self.scanner.resolve_folder(folder_name) if folder_name else None
        bd    = self.scanner.file_type_breakdown(abs_folder)
        label = f"'{folder_name}'" if abs_folder else f"'{self.scanner.root_name}'"

        lines = [f"File-type distribution for {label}:"]
        for ext, (cnt, pct) in bd.items():
            lines.append(f"  - {ext or '(no extension)'}: {cnt:,} files  ({pct}%)")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_duplicates(self, query: str):
        dupes = self.scanner.duplicates
        lines = []
        if not dupes:
            lines.append(f"No duplicate file names were found anywhere in '{self.scanner.root_name}'.")
        else:
            lines.append(f"Found {len(dupes):,} file name(s) that appear in multiple locations:")
            for name, paths in list(dupes.items())[:20]:
                lines.append(f"  '{name}' appears {len(paths)} times:")
                for p in paths:
                    lines.append(f"    • {p}")
            if len(dupes) > 20:
                lines.append(f"  … and {len(dupes)-20} more.")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_search(self, query: str):
        q = re.sub(r"\b(search for|search|find files named|find files|filter by|filter)\b",
                   "", query, flags=re.IGNORECASE).strip()
        ext = self._extract_ext(q.lower())
        if ext:
            results = self.scanner.search_files(ext=ext)
            lines   = [f"Files with extension '{ext}': {len(results):,} found."]
        else:
            term    = q.strip("?'\" ")
            results = self.scanner.search_files(name=term) or self.scanner.search_files(keyword=term)
            lines   = [f"Search results for '{term}': {len(results):,} found."]

        for f in results[:20]:
            lines.append(f"  - {f.relpath}  ({_hr(f.size)})")
        if len(results) > 20:
            lines.append(f"  … and {len(results)-20} more.")

        print(f"\n🤖 {llm_speak(query, chr(10).join(lines))}\n")

    def _q_analyze(self, query: str) -> bool:
        """Detect and analyze a specific document. Returns True if handled."""
        supported_exts = {".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".csv", ".zip"}

        # Direct filename match (fast path)
        q_lower = query.lower()
        for f in self.scanner.files:
            if f.ext in supported_exts and f.name.lower() in q_lower:
                print(f"\n🔬 Reading: {f.relpath} …")
                summary = self.analyzer.analyze(f.path)
                print(f"🤖 {summary}\n")
                return True

        # Ask LLM to identify the file (slow path)
        supported = [f.relpath for f in self.scanner.files if f.ext in supported_exts][:60]
        if not supported:
            return False

        id_prompt = (
            f"User request: \"{query}\"\n\n"
            "Supported files:\n" + "\n".join(f"- {p}" for p in supported) +
            "\n\nIf the user wants to analyze a specific file, return JSON: "
            "{\"file\": \"<exact relative path>\"}. Otherwise return {\"file\": null}."
        )
        resp = ask_llm([{"role": "user", "content": id_prompt}], temperature=0, max_tokens=80)
        try:
            m = re.search(r'\{.*?"file".*?\}', resp, re.DOTALL)
            if m:
                fpath = json.loads(m.group()).get("file")
                if fpath:
                    full = os.path.join(self.scanner.root, fpath)
                    if os.path.exists(full):
                        print(f"\n🔬 Reading: {fpath} …")
                        summary = self.analyzer.analyze(full)
                        print(f"🤖 {summary}\n")
                        return True
        except Exception:
            pass
        return False

    def _q_general(self, query: str):
        """Catch-all: give LM Studio the full fact sheet and let it answer."""
        data_context = self.scanner.directory_fact_sheet()
        print(f"\n🤖 {llm_speak(query, data_context)}\n")

    # ── Extraction helpers ────────────────────────────────────────────────────

    # Generic English words that happen to share a name with common folders —
    # never treat these as a folder reference unless the user quotes them.
    _FOLDER_WORD_BLACKLIST = frozenset({
        "folder", "directory", "dir", "file", "files",
        "the", "and", "for", "from", "into", "with", "this", "that",
        "size", "total", "space", "disk", "path", "name", "type", "new", "old",
        "here", "there", "all", "any", "each", "my", "our", "your",
        "give", "show", "list", "what", "how", "many", "much", "does",
        "big", "large", "tell", "about", "inside", "under", "within",
    })

    def _extract_folder(self, query: str):
        root_name = self.scanner.root_name.lower()

        # Quoted names — highest priority, always trust
        m = re.search(r'[\'"]([^\'"]+)[\'"]', query)
        if m and self.scanner.resolve_folder(m.group(1)):
            return m.group(1)

        # Linguistic patterns:  "… of/in/under/inside <name> folder/directory"
        #                        "folder named/called <name>"
        for pat in (
            r"(?:in|inside|under|within|of)\s+(?:the\s+)?['\"]?([\w][\w\s\-_.]*?)['\"]?\s+(?:folder|directory|dir)\b",
            r"(?:folder|directory)\s+(?:named?|called)\s+['\"]?([\w][\w\s\-_.]*?)['\"]?\b",
        ):
            m = re.search(pat, query, re.IGNORECASE)
            if m:
                candidate = m.group(1).strip()
                # If user named the root explicitly, return None so callers use root
                if candidate.lower() == root_name:
                    return None
                if self.scanner.resolve_folder(candidate):
                    return candidate

        # Any known folder name literally present in the query (word-boundary match)
        q_lower = query.lower()
        candidates = []
        for abs_path in self.scanner.all_folders:
            fname = os.path.basename(abs_path).lower()
            if not fname or len(fname) <= 2:
                continue
            if fname in self._FOLDER_WORD_BLACKLIST:
                continue          # ← skip generic English words like "folder"
            if fname == root_name:
                continue          # root handled by callers
            # Use word-boundary matching to avoid "exe" matching "exercise" etc.
            if re.search(r'\b' + re.escape(fname) + r'\b', q_lower):
                candidates.append((abs_path.count(os.sep), fname, abs_path))

        if candidates:
            candidates.sort()
            return os.path.basename(candidates[0][2])
        return None

    @staticmethod
    def _extract_ext(q: str):
        m = re.search(
            r'\b(pdf|docx?|pptx?|xlsx?|csv|zip|png|jpe?g|mp3|mp4|txt|exe|apk|html?|py|js|ts|json|xml|svg)\b',
            q, re.IGNORECASE,
        )
        if m:
            ext = m.group(1).lower()
            return "." + {"doc": "docx", "ppt": "pptx", "xls": "xlsx",
                          "htm": "html", "jpeg": "jpg"}.get(ext, ext)
        return None

    def _print_help(self):
        print("""
✨ Example questions you can ask (all answered in natural language by LM Studio):

  "What sub-folders are inside Downloads?"
  "List all sub-folders under the Folder directory"
  "Where is config.json?"
  "List the files inside the word folder"
  "How many PDF files are there?"
  "How many files are in the exe folder?"
  "What is the total size of Downloads?"
  "What is the size of the MP4 folder?"
  "What are the largest files?"
  "What are the largest folders?"
  "Show the file type breakdown"
  "Are there any duplicate files?"
  "Search for files named report"
  "Find all .xlsx files"
  "Summarize report.pdf"
  "Analyze the file Q3_report.docx"
  "What is inside project.zip?"

  Type 'quit' to exit.
""")

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    InteractiveShell().run()
