# pip install requests colorama

import os
import sys
import time
import random
import threading
import requests
from colorama import init, Fore, Style

init(autoreset=True)

PING_URL      = "https://speed.cloudflare.com/__down?bytes=1"
DOWNLOAD_URL  = "https://speed.cloudflare.com/__down?bytes=25000000"
UPLOAD_URL    = "https://speed.cloudflare.com/__up"
TIMEOUT       = 30
PING_ROUNDS   = 10


# ── Spinner ────────────────────────────────────────────────────────────────────

class Spinner:
    _frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def __init__(self, message: str):
        self.message  = message
        self._stop    = threading.Event()
        self._thread  = threading.Thread(target=self._spin, daemon=True)

    def _spin(self):
        idx = 0
        while not self._stop.is_set():
            frame = self._frames[idx % len(self._frames)]
            sys.stdout.write(f"\r {Fore.CYAN}{frame}{Style.RESET_ALL}  {self.message}   ")
            sys.stdout.flush()
            time.sleep(0.08)
            idx += 1

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        self._thread.join()
        sys.stdout.write("\r" + " " * (len(self.message) + 10) + "\r")
        sys.stdout.flush()


# ── Colour helpers ─────────────────────────────────────────────────────────────

def colour_ping(ms: float) -> str:
    val = f"{ms:>6.1f} ms"
    if ms < 30:
        return Fore.GREEN + val + Style.RESET_ALL
    if ms <= 100:
        return Fore.YELLOW + val + Style.RESET_ALL
    return Fore.RED + val + Style.RESET_ALL

def colour_download(mbps: float) -> str:
    val = f"{mbps:>6.1f} Mbps"
    if mbps > 50:
        return Fore.GREEN + val + Style.RESET_ALL
    if mbps >= 10:
        return Fore.YELLOW + val + Style.RESET_ALL
    return Fore.RED + val + Style.RESET_ALL

def colour_upload(mbps: float) -> str:
    val = f"{mbps:>6.1f} Mbps"
    if mbps > 20:
        return Fore.GREEN + val + Style.RESET_ALL
    if mbps >= 5:
        return Fore.YELLOW + val + Style.RESET_ALL
    return Fore.RED + val + Style.RESET_ALL


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_ping() -> float:
    latencies = []
    for _ in range(PING_ROUNDS):
        t0 = time.perf_counter()
        r  = requests.head(PING_URL, timeout=TIMEOUT)
        t1 = time.perf_counter()
        r.raise_for_status()
        latencies.append((t1 - t0) * 1000)
    return sum(latencies) / len(latencies)


def test_download() -> float:
    t0   = time.perf_counter()
    r    = requests.get(DOWNLOAD_URL, timeout=TIMEOUT, stream=True)
    r.raise_for_status()
    size = 0
    for chunk in r.iter_content(chunk_size=65536):
        size += len(chunk)
    t1   = time.perf_counter()
    return (size * 8) / ((t1 - t0) * 1_000_000)          # Mbps


def test_upload() -> float:
    data = random.randbytes(10 * 1024 * 1024)             # 10 MB
    size = len(data)
    t0   = time.perf_counter()
    r    = requests.post(
        UPLOAD_URL,
        data=data,
        headers={"Content-Type": "application/octet-stream"},
        timeout=TIMEOUT,
    )
    t1   = time.perf_counter()
    r.raise_for_status()
    return (size * 8) / ((t1 - t0) * 1_000_000)          # Mbps


# ── Main ───────────────────────────────────────────────────────────────────────

def run_test(label: str, fn) -> float | None:
    print(f"\n {Fore.CYAN}Testing {label}...{Style.RESET_ALL}")
    try:
        with Spinner(f"Running {label} test"):
            result = fn()
        return result
    except requests.exceptions.Timeout:
        print(f" {Fore.RED}✖  {label} test timed out after {TIMEOUT}s.{Style.RESET_ALL}")
    except requests.exceptions.ConnectionError as exc:
        print(f" {Fore.RED}✖  Connection error during {label} test: {exc}{Style.RESET_ALL}")
    except requests.exceptions.HTTPError as exc:
        print(f" {Fore.RED}✖  HTTP error during {label} test: {exc}{Style.RESET_ALL}")
    except Exception as exc:
        print(f" {Fore.RED}✖  Unexpected error during {label} test: {exc}{Style.RESET_ALL}")
    return None


def print_results(ping: float | None, dl: float | None, ul: float | None) -> None:
    bar = "=" * 32
    print(f"\n {Fore.WHITE}{Style.BRIGHT}{bar}")
    print(f"   WiFi Speed Test Results")
    print(f" {bar}{Style.RESET_ALL}")

    ping_str = colour_ping(ping)   if ping is not None else Fore.RED + "  ERROR" + Style.RESET_ALL
    dl_str   = colour_download(dl) if dl   is not None else Fore.RED + "  ERROR" + Style.RESET_ALL
    ul_str   = colour_upload(ul)   if ul   is not None else Fore.RED + "  ERROR" + Style.RESET_ALL

    print(f"  Ping      :  {ping_str}")
    print(f"  Download  :  {dl_str}")
    print(f"  Upload    :  {ul_str}")
    print(f" {Fore.WHITE}{Style.BRIGHT}{bar}{Style.RESET_ALL}\n")


if __name__ == "__main__":
    print(f"\n {Fore.WHITE}{Style.BRIGHT}WiFi Speed Test{Style.RESET_ALL}")
    print(f" {Fore.CYAN}Powered by Cloudflare speed.cloudflare.com{Style.RESET_ALL}")

    ping_ms   = run_test("ping",     test_ping)
    dl_mbps   = run_test("download", test_download)
    ul_mbps   = run_test("upload",   test_upload)

    print_results(ping_ms, dl_mbps, ul_mbps)