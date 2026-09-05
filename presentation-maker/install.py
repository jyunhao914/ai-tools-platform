#!/usr/bin/env python3
"""Presentation Maker distribution bootstrap; does not change plugin workflows.

Download and SHA-256-check the fixed release before any installer is run.
Run --prepare-only to verify/extract without registering or installing anything.
"""
import argparse
import hashlib
import json
import os
import platform
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import sysconfig
import tempfile
import urllib.request
import zipfile

VERSION = "0.1.0+codex.20260904233925"
BASE = "https://github.com/jyunhao914/ai-tools-platform/releases/download/presentation-maker-20260905/"
PACKAGES = {
    "macos": ("Presentation-Maker-macOS-install2.zip", "948ec954f9a04f20c627b545a193821cddaa506d4c8f9fa62ae6763b2b040c1d"),
    "windows": ("Presentation-Maker-Windows-install2.zip", "e6d9b00a6c2e476d626cb62b93e9caa9051ab33468c11abddd20aa8b04a7cafd"),
}

def system_key(system=None, machine=None):
    system, machine = system or platform.system(), (machine or platform.machine()).lower()
    if system == "Darwin" and machine in ("arm64", "aarch64", "x86_64"):
        return "macos"
    if system == "Windows" and machine in ("amd64", "x86_64", "arm64", "aarch64"):
        return "windows"
    raise RuntimeError("Unsupported system: use macOS or 64-bit Windows.")

def extract_verified(archive, destination, digest):
    with open(archive, "rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != digest:
        raise RuntimeError("SHA-256 mismatch. Nothing installed; download again from the publisher.")
    with zipfile.ZipFile(archive) as z:
        if sum(i.file_size for i in z.infolist()) > 1_500_000_000:
            raise RuntimeError("Archive exceeds extraction size limit.")
        for entry in z.infolist():
            p = PurePosixPath(entry.filename)
            if p.is_absolute() or ".." in p.parts or "\\" in entry.filename or ":" in entry.filename:
                raise RuntimeError("Unsafe archive path.")
            if not p.parts or p.parts[0] != "ai-presentation-marketplace":
                raise RuntimeError("Unexpected archive root.")
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise RuntimeError("Archive symlinks are not allowed.")
        if z.testzip():
            raise RuntimeError("Damaged archive.")
        z.extractall(destination)
        for entry in z.infolist():
            if not entry.is_dir():
                mode = (entry.external_attr >> 16) & 0o777
                if mode:
                    (destination / entry.filename).chmod(mode)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--archive", type=Path, help="Use an already-downloaded release ZIP; SHA-256 is still required")
    args = parser.parse_args()
    key = system_key()
    if key == "windows" and sysconfig.get_platform() != "win-amd64":
        raise RuntimeError("Use the desktop app's x64 Python runtime; Windows 11 ARM can run it through emulation.")
    if key == "macos" and int(platform.mac_ver()[0].split(".")[0]) < 14:
        raise RuntimeError("macOS 14 or newer is required by this release.")
    filename, digest = PACKAGES[key]
    store = Path.home() / ".presentation-maker" / "installations"
    store.mkdir(parents=True, exist_ok=True)
    # Keep each attempt separate, retain old installations and personal styles.
    attempt = Path(tempfile.mkdtemp(prefix="20260905-", dir=store))
    archive = args.archive or (attempt / filename)
    if not args.archive:
        print("[1/4] Downloading publisher release...", flush=True)
        req = urllib.request.Request(BASE + filename, headers={"User-Agent": "PresentationMaker-Installer/1"})
        with urllib.request.urlopen(req, timeout=90) as response, archive.open("wb") as out:
            shutil.copyfileobj(response, out)
    print("[2/4] Checking SHA-256 and extracting...", flush=True)
    extract_verified(archive, attempt, digest)
    root = attempt / "ai-presentation-marketplace"
    manifest = json.loads((root / "plugins/ai-presentation-plugin/.codex-plugin/plugin.json").read_text(encoding="utf-8"))
    if manifest.get("version") != VERSION:
        raise RuntimeError("Unexpected plugin version.")
    if args.prepare_only:
        print("PREPARED ONLY; not installed. " + str(root))
        return
    env = dict(os.environ, PM_PYTHON=sys.executable)
    command = (["/bin/zsh", str(root / "安裝 Presentation Maker.command")] if key == "macos" else
               ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(root / "install_windows.ps1")])
    print("[3/4] Installing dependencies and registering plugin...", flush=True)
    subprocess.run(command, env=env, stdin=subprocess.DEVNULL, check=True)
    receipt = {"version": VERSION, "platform": key, "package_sha256": digest, "installation": str(root), "status": "installer_verified"}
    receipt_path = attempt / "installation-receipt.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[4/4] Installer verified. Open a NEW local task; restart the app if necessary.")
    print("RECEIPT: " + str(receipt_path))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("INSTALLATION NOT COMPLETE: " + str(exc), file=sys.stderr)
        sys.exit(1)
