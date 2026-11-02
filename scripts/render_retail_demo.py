#!/usr/bin/env python3
"""Reproduce BBox/heatmap demo and data using the attributed actual-store clip."""
from pathlib import Path
import json
import shutil
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2
from server.analysis import analyze_video
from server.exports import detection_csv
from server.render import render_analysis


def main():
    data, output = ROOT / "server/data", ROOT / "artifacts"
    manifest = json.loads((data / "demo-retail.json").read_text(encoding="utf-8"))
    result = analyze_video(data / manifest["video"], analysis_id=uuid.uuid4().hex,
                           name=manifest["name"], kind="public-retail", zones=manifest["zones"],
                           video_url="/media/demo-retail.mp4")
    result["source"]["provenance"] = manifest["provenance"]
    result.update(render_analysis(result, data / manifest["video"], data / "media"))
    output.mkdir(parents=True, exist_ok=True)
    artifacts = {}
    for key, name in [("annotated_video_url", "store-ai-real-bbox.mp4"), ("heatmap_video_url", "store-ai-real-heatmap.mp4")]:
        destination = output / name
        shutil.copyfile(data / "media" / Path(result[key]).name, destination)
        artifacts[key] = name
    result["artifact_files"] = artifacts
    (output / "store-ai-real-analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "store-ai-real-detections.csv").write_text(detection_csv(result), encoding="utf-8")
    for name in ["bbox", "heatmap"]:
        cap = cv2.VideoCapture(str(output / f"store-ai-real-{name}.mp4"))
        cap.set(cv2.CAP_PROP_POS_MSEC, 40000)
        ok, image = cap.read()
        if ok:
            cv2.imwrite(str(output / f"store-ai-real-{name}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 94])
        cap.release()
    # Persist for API use after a process restart, too.
    results = data / "results"
    results.mkdir(exist_ok=True)
    (results / f"{result['id']}.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"status": "completed", "source": result["source"], "metrics": result["metrics"], "zone_dwell": result["zone_dwell"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
