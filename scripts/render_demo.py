#!/usr/bin/env python3
"""Create the downloadable BBox/heatmap demo from measured video detections.

Run: .venv/bin/python scripts/render_demo.py
Or: .venv/bin/python scripts/render_demo.py --result server/data/results/ID.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2

from server.analysis import analyze_video
from server.render import render_analysis


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", type=Path, help="Existing measured result JSON; omitted means analyze original synthetic demo")
    parser.add_argument("--source", type=Path, default=ROOT / "server/data/demo-mart.mp4")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "server/data/media")
    parser.add_argument("--artifact-dir", type=Path, default=ROOT / "artifacts")
    args = parser.parse_args()
    if args.result:
        result = json.loads(args.result.read_text(encoding="utf-8"))
    else:
        config = json.loads((ROOT / "server/data/demo-mart-config.json").read_text())
        result = analyze_video(args.source, analysis_id=uuid.uuid4().hex,
                               name="MART 01 · Synthetic CCTV sample", kind="synthetic",
                               config=config, zones=config.get("zones"), video_url="/media/demo-mart.mp4")
    result.update(render_analysis(result, args.source, args.output_dir))
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    for key, name in [("annotated_video_url", "store-ai-bbox-demo.mp4"), ("heatmap_video_url", "store-ai-heatmap-demo.mp4")]:
        source = args.output_dir / Path(result[key]).name
        target = args.artifact_dir / name
        shutil.copyfile(source, target)
        print(f"{target}: {target.stat().st_size:,} bytes")
    cap = cv2.VideoCapture(str(args.artifact_dir / "store-ai-heatmap-demo.mp4"))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, cap.get(cv2.CAP_PROP_FRAME_COUNT)-2))
    ok, frame = cap.read()
    if ok:
        cv2.imwrite(str(args.artifact_dir / "store-ai-heatmap.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cap.release()
    (args.artifact_dir / "store-ai-demo-analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(result["metrics"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
