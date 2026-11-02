#!/usr/bin/env python3
"""Prepare an attributed real-store sample from Intel's CC BY 4.0 video."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "server" / "data"
REVISION = "57978890822836f2b4743852f04f62fc511757e4"
EXPECTED_SHA256 = "3526fee39cac70d6366471e4324a6d63b337c8f8ab99c015521bee0d60ed6e04"
RAW_URL = f"https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/{REVISION}/store-aisle-detection.mp4"
SOURCE_URL = f"https://github.com/intel-iot-devkit/sample-videos/blob/{REVISION}/store-aisle-detection.mp4"
ZONES = [
    {"id": "produce", "label": "Left display", "x": .02, "y": .30, "w": .22, "h": .65, "color": "#e99b58"},
    {"id": "aisle", "label": "Rear aisle", "x": .24, "y": .02, "w": .33, "h": .28, "color": "#809be0"},
    {"id": "checkout", "label": "Front center", "x": .24, "y": .80, "w": .38, "h": .20, "color": "#dc9ac1"},
    {"id": "household", "label": "Right display", "x": .57, "y": .30, "w": .30, "h": .50, "color": "#68b6a2"},
]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Optional already downloaded original; checksum still required")
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    destination = DATA / "demo-retail.mp4"
    manifest_path = DATA / "demo-retail.json"
    if not args.source and destination.exists() and manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        if digest(destination) == existing.get("video_sha256") and existing.get("provenance", {}).get("source_sha256") == EXPECTED_SHA256 and existing.get("zones") == ZONES:
            print("Verified existing real-store sample and source provenance")
            return
    with tempfile.TemporaryDirectory(prefix="store-real-demo-") as temporary:
        source = args.source or Path(temporary) / "store-aisle-detection.mp4"
        if not args.source:
            request = urllib.request.Request(RAW_URL, headers={"User-Agent": "TrackerAI-DemoSetup/0.1"})
            with urllib.request.urlopen(request, timeout=90) as response, source.open("wb") as stream:
                shutil.copyfileobj(response, stream)
        if digest(source) != EXPECTED_SHA256:
            raise RuntimeError("Original public video SHA-256 mismatch; rejected")
        output = Path(temporary) / "demo-retail.mp4"
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", "8", "-i", str(source), "-t", "52", "-an", "-vf", "fps=15",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-threads", "2", "-movflags", "+faststart", str(output),
        ], check=True, timeout=180)
        provenance = {
            "title": "store-aisle-detection.mp4", "creator": "Intel IoT DevKit / sample-videos contributors",
            "source_url": SOURCE_URL, "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "repository_license_url": f"https://github.com/intel-iot-devkit/sample-videos/blob/{REVISION}/LICENSE",
            "source_revision": REVISION, "source_sha256": EXPECTED_SHA256,
            "original_start_seconds": 8, "original_end_seconds": 60,
            "changes": "Original 00:08–01:00 excerpt; resampled to 15 fps; audio removed; H.264 transcoding. Analysis outputs add anonymous BBoxes, trails and dwell heatmaps.",
            "scene": "Actual housewares retail store; fixed elevated camera. Not a supermarket food aisle, simulation or generated video.",
            "attribution": "Intel IoT DevKit sample-videos contributors · CC BY 4.0 · modified excerpt",
            "license_notice": "See docs/licenses/intel-sample-videos-CC-BY-4.0.txt. No endorsement implied.",
        }
        manifest = {"name": "Public housewares store · Intel sample", "kind": "public-retail", "video": destination.name,
                    "video_sha256": digest(output), "zones": ZONES, "provenance": provenance}
        shutil.copyfile(output, destination)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Prepared {destination}: {destination.stat().st_size:,} bytes, 52 seconds, CC BY 4.0")


if __name__ == "__main__":
    main()
