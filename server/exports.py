"""Raw observation CSV: one row per detection, including source provenance."""
import csv
import io

DETECTION_FIELDS = [
    "analysis_id", "source_name", "source_kind", "source_url", "source_license", "detector", "frame_index", "time_seconds",
    "track_id", "role", "zone", "bbox_x", "bbox_y", "bbox_width", "bbox_height",
    "bbox_x_px", "bbox_y_px", "bbox_width_px", "bbox_height_px", "confidence", "sample_seconds",
]


def detection_rows(result: dict):
    source = result["source"]
    provenance = source.get("provenance") or {}
    width, height = source["width"], source["height"]
    for frame in result["frames"]:
        for person in frame["people"]:
            x, y, w, h = person["bbox"]
            yield {
                "analysis_id": result["id"], "source_name": source["name"], "source_kind": source["kind"], "detector": source["detector"],
                "source_url": provenance.get("source_url", ""), "source_license": provenance.get("license", ""),
                "frame_index": frame["frame_index"], "time_seconds": frame["time"], "track_id": person["id"], "role": person["role"], "zone": person["zone"],
                "bbox_x": x, "bbox_y": y, "bbox_width": w, "bbox_height": h,
                "bbox_x_px": round(x * width, 2), "bbox_y_px": round(y * height, 2), "bbox_width_px": round(w * width, 2), "bbox_height_px": round(h * height, 2),
                "confidence": person["confidence"], "sample_seconds": frame["sample_seconds"],
            }


def detection_csv(result: dict) -> str:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=DETECTION_FIELDS)
    writer.writeheader()
    writer.writerows(detection_rows(result))
    return "\ufeff" + stream.getvalue()
