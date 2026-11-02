#!/usr/bin/env python3
"""Download a pinned upstream model, verify SHA-256, then install atomically."""
from pathlib import Path
import hashlib
import os
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server.detector import MODEL_DIR, MODEL_FILES, MODEL_REVISION


def setup():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, expected in MODEL_FILES.items():
        destination = MODEL_DIR / name
        if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected:
            print(f"Verified: {name}")
            continue
        url = f"https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/{MODEL_REVISION}/{name}"
        request = urllib.request.Request(url, headers={"User-Agent": "TrackerAI-ModelSetup/0.1"})
        descriptor, temporary = tempfile.mkstemp(prefix="model-", dir=MODEL_DIR)
        digest = hashlib.sha256()
        try:
            with os.fdopen(descriptor, "wb") as output, urllib.request.urlopen(request, timeout=90) as response:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise RuntimeError(f"SHA-256 mismatch for {name}; artifact rejected")
            os.replace(temporary, destination)
            print(f"Downloaded and verified: {name}")
        finally:
            Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    setup()
