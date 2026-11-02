"""Measured local person observations; synthetic and pretrained inputs are explicit."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
import math

import cv2
import numpy as np

from .detector import DETECTOR_NAME, MODEL_REVISION, PersonDetector

SAMPLE_FPS = 3.0
MAX_DURATION = 120.0
DEFAULT_ZONES = [
    {"id": "produce", "label": "Produce", "x": .05, "y": .08, "w": .40, "h": .40, "color": "#e99b58"},
    {"id": "aisle", "label": "Main aisle", "x": .48, "y": .10, "w": .15, "h": .40, "color": "#809be0"},
    {"id": "checkout", "label": "Checkout", "x": .48, "y": .52, "w": .15, "h": .16, "color": "#dc9ac1"},
    {"id": "household", "label": "Household", "x": .66, "y": .12, "w": .30, "h": .80, "color": "#68b6a2"},
]


def probe_video(path: Path) -> dict:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError("Cannot open this video. Check that it is a valid MP4, MOV, AVI, MKV, or WebM file.")
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        count = float(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not math.isfinite(fps) or fps <= 0 or not math.isfinite(count) or count <= 0 or width < 16 or height < 16:
            raise ValueError("Cannot read the video duration or resolution.")
        duration = count / fps
        if duration > MAX_DURATION + .1:
            raise ValueError("This demo accepts videos up to 120 seconds. Trim the clip before uploading.")
        ok, _ = cap.read()
        if not ok:
            raise ValueError("Cannot decode the first video frame.")
        return {"duration": round(duration, 3), "width": width, "height": height, "fps": round(fps, 3)}
    finally:
        cap.release()


def zone_for(center: tuple[float, float], zones: list[dict]) -> str:
    x, y = center
    for zone in zones:
        if zone["x"] <= x <= zone["x"] + zone["w"] and zone["y"] <= y <= zone["y"] + zone["h"]:
            return zone["id"]
    return "other"


def synthetic_detections(frame: np.ndarray, markers: list[dict]) -> list[dict]:
    """Read actual colored actor pixels, never scripted trajectories or counts."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    height, width = frame.shape[:2]
    result = []
    for marker in markers:
        color = np.asarray(marker["color"], dtype=np.int16)
        mask = cv2.inRange(rgb, np.clip(color - 32, 0, 255).astype(np.uint8), np.clip(color + 32, 0, 255).astype(np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        if cv2.contourArea(contour) < 30:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        result.append({"marker_id": str(marker["id"]), "role": "person", "bbox": [x / width, y / height, w / width, h / height], "confidence": 1.0})
    return result


@dataclass
class Track:
    id: str
    center: tuple[float, float]
    last_seen: float
    first_seen: float
    zone: str = "other"
    seen: int = 0
    observed: float = 0.
    positions: list = field(default_factory=list)
    zone_seconds: dict = field(default_factory=dict)


def analyze_video(path: Path, *, analysis_id: str, name: str, kind: str, zones: list[dict] | None = None,
                  config: dict | None = None, progress: Callable[[float], None] | None = None,
                  video_url: str | None = None) -> dict:
    metadata = probe_video(path)
    zones = zones or DEFAULT_ZONES
    config = config or {}
    if kind == "synthetic" and not config.get("markers"):
        raise ValueError("The synthetic sample color-marker configuration is missing.")
    detector = None if kind == "synthetic" else PersonDetector()
    source = {"name": name, "kind": kind, **metadata,
              "detector": "synthetic-color-markers" if kind == "synthetic" else DETECTOR_NAME,
              "model_revision": None if kind == "synthetic" else MODEL_REVISION}
    tracks: dict[str, Track] = {}
    frames, events = [], []
    next_id = 1
    labels = {zone["id"]: zone["label"] for zone in zones}
    cap = cv2.VideoCapture(str(path))
    frame_index, next_time = 0, 0.
    dt = max(1 / SAMPLE_FPS, 1 / metadata["fps"])
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            time = frame_index / metadata["fps"]
            frame_index += 1
            if time + 1e-5 < next_time:
                continue
            next_time += dt
            detections = synthetic_detections(frame, config["markers"]) if kind == "synthetic" else detector.detect(frame)
            used = set()
            people = []
            for detection in detections:
                x, y, w, h = detection["bbox"]
                center = (x + w / 2, y + h / 2)
                zone = zone_for(center, zones)
                track_id = detection.get("marker_id")
                if track_id is None:
                    candidates = [(math.dist(center, track.center), key) for key, track in tracks.items()
                                  if key not in used and time - track.last_seen < 2.0]
                    if candidates and min(candidates)[0] < .14:
                        track_id = min(candidates)[1]
                    else:
                        track_id = f"T{next_id:03}"
                        next_id += 1
                used.add(track_id)
                is_new = track_id not in tracks
                if is_new:
                    tracks[track_id] = Track(track_id, center, time, time)
                    events.append({"time": round(time, 2), "type": "enter", "label": "Person track first observed", "track_id": track_id, "zone": zone})
                track = tracks[track_id]
                elapsed = time - track.last_seen
                moving = not is_new and elapsed > 0 and math.dist(center, track.center) / elapsed > .014
                if zone != track.zone and not is_new:
                    events.append({"time": round(time, 2), "type": "zone_change", "label": f"{labels.get(track.zone, 'Other area')} → {labels.get(zone, 'Other area')}", "track_id": track_id, "zone": zone})
                track.zone, track.center, track.last_seen = zone, center, time
                track.seen += 1
                track.positions.append([round(time, 2), round(center[0], 4), round(center[1], 4)])
                people.append({"id": track_id, "role": "person", "bbox": [round(v, 5) for v in detection["bbox"]], "zone": zone, "moving": bool(moving), "confidence": detection["confidence"]})
            by_zone = {zone: sum(person["zone"] == zone for person in people) for zone in [*labels, "other"]}
            frames.append({"time": round(time, 3), "frame_index": frame_index - 1, "people": people,
                           "counts": {"people": len(people), "by_zone": by_zone}})
            if progress:
                progress(min(98., 5 + 93 * time / metadata["duration"]))
    finally:
        cap.release()
    if not frames:
        raise ValueError("The video contains no decodable observation frames.")
    # The real source frame clock may have unequal intervals (e.g. 7fps input).
    # Each detection contributes only its measured sample exposure, capped at end.
    for index, frame in enumerate(frames):
        end = frames[index + 1]["time"] if index + 1 < len(frames) else metadata["duration"]
        exposure = max(0., end - frame["time"])
        frame["sample_seconds"] = round(exposure, 6)
        for person in frame["people"]:
            track = tracks[person["id"]]
            track.observed += exposure
            track.zone_seconds[person["zone"]] = track.zone_seconds.get(person["zone"], 0.) + exposure
    metrics = {"unique_people": len(tracks), "confirmed_tracks": sum(track.seen >= 2 for track in tracks.values()),
               "peak_people": max(frame["counts"]["people"] for frame in frames),
               "total_person_seconds": round(sum(track.observed for track in tracks.values()), 3),
               "observed_seconds": round(metadata["duration"], 3),
               "detections": sum(len(frame["people"]) for frame in frames)}
    zone_dwell = [{"zone": zone, "label": labels.get(zone, "Other area"),
                   "person_seconds": round(sum(track.zone_seconds.get(zone, 0.) for track in tracks.values()), 3),
                   "unique_tracks": sum(zone in track.zone_seconds for track in tracks.values())} for zone in [*labels, "other"]]
    series = []
    for start in np.arange(0, metadata["duration"], 5.):
        end = min(float(start + 5), metadata["duration"])
        overlaps = [(frame, max(0., min(frame["time"] + frame["sample_seconds"], end) - max(frame["time"], start))) for frame in frames]
        series.append({"time": float(start), "label": f"{int(start) // 60:02}:{int(start) % 60:02}",
                       "people": round(sum(frame["counts"]["people"] * weight for frame, weight in overlaps) / (end-start), 2)})
    limitations = [
        "The synthetic sample detects colored markers in decoded frames. It does not validate detection accuracy in a real store." if kind == "synthetic" else "Real footage uses the person class of a pretrained MobileNet-SSD model. Occlusion, overhead views, and small people can cause missed detections.",
        "Track IDs are temporary nearest-centroid associations. Occlusion, crossings, or re-entry can split or switch IDs; they do not identify individuals or establish an exact visitor count.",
        "The pipeline does not infer a person's role, identity, or purchases. Zones are assigned from bounding-box centers.",
        "Observation time is weighted by the actual intervals between frames sampled at up to 3 fps. Behavior between samples is not directly observed.",
        "Model confidence is a detection score, not measured store-level accuracy. The heatmap accumulates observation time at detected positions.",
    ]
    return {"id": analysis_id, "status": "completed", "progress": 100, "source": source,
            "video_url": video_url or f"/media/{path.name}", "zones": zones, "frames": frames,
            "metrics": metrics, "series": series, "events": events, "zone_dwell": zone_dwell, "insights": [], "limitations": limitations,
            "tracks": [{"id": track.id, "role": "person", "first_seen": round(track.first_seen, 2), "last_seen": round(track.last_seen, 2),
                        "observed_seconds": round(track.observed, 3), "zone_seconds": {key: round(value, 3) for key, value in track.zone_seconds.items()},
                        "observations": track.seen, "positions": track.positions} for track in tracks.values()],
            "methodology": {"sample_fps": SAMPLE_FPS, "bucket_seconds": 5, "role_assignment": "none_person_only",
                            "interval": "actual_next_sample_timestamp_or_clip_end", "unique_people": "temporary_track_ids_not_identified_visitors",
                            "confidence": "Synthetic marker match=1; MobileNet model score is not calibrated accuracy.",
                            "zone_assignment": "bbox_center_first_matching_rectangle", "person_confidence_threshold": None if kind == "synthetic" else .4}}
