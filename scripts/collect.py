#!/usr/bin/env python3
"""Collect pretrained person detections and render BBox/heatmap videos offline."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.analysis import analyze_video, DEFAULT_ZONES
from server.render import render_analysis
from server.exports import detection_csv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Input video, maximum 120 seconds")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "collection")
    parser.add_argument("--zones", type=Path, help="JSON array of normalized zone rectangles")
    parser.add_argument("--no-render", action="store_true", help="Save detection data only")
    args = parser.parse_args()
    if not args.video.is_file():
        parser.error("Input video does not exist")
    zones = DEFAULT_ZONES
    if args.zones:
        # Reuse the same validation rules as the API.
        from server.app import validate_zones
        zones = validate_zones(args.zones.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)
    result = analyze_video(args.video, analysis_id=uuid.uuid4().hex, name=args.video.name,
                           kind="upload", zones=zones)
    if not args.no_render:
        result.update(render_analysis(result, args.video, args.output))
        # Local CLI output is independent of the HTTP server's media directory.
        result["local_video_files"] = {
            key: str((args.output / Path(result[key]).name).resolve())
            for key in ("annotated_video_url", "heatmap_video_url")
        }
        result.pop("annotated_video_url", None)
        result.pop("heatmap_video_url", None)
    (args.output / "analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output / "detections.csv").write_text(detection_csv(result), encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "sampled_frames": len(result["frames"]),
                      "detection_rows": sum(len(f["people"]) for f in result["frames"]),
                      "detector": result["source"]["detector"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
