"""Export measured tracks as shareable BBox and cumulative-dwell MP4 videos.

Heat is integrated in person-seconds at actually observed body centers. The
legend is relative spatial dwell within this clip, never inferred temperature.
No new detections, trajectories, or analytical metrics are invented here.
"""
from __future__ import annotations

from bisect import bisect_right
from collections import deque
import math
from pathlib import Path
import re
import subprocess
import tempfile

import cv2
import numpy as np


ACCENT_COLOR = (87, 172, 255)  # BGR
PERSON_COLOR = (206, 224, 92)
TEXT_COLOR = (239, 241, 231)
PANEL_COLOR = (35, 43, 37)


def people_at(frames: list[dict], timestamps: list[float], time: float) -> list[dict]:
    """Interpolate adjacent observations only; do not bridge detector gaps."""
    if not frames:
        return []
    index = bisect_right(timestamps, time) - 1
    left = frames[max(0, index)]
    right = frames[min(len(frames) - 1, index + 1)]
    nearest = left if abs(time - left["time"]) <= abs(time - right["time"]) else right
    if abs(time - nearest["time"]) > .4:
        return []
    if left is right or right["time"] - left["time"] > .8 or time < left["time"]:
        return [dict(person) for person in nearest["people"]]
    right_by_id = {str(person["id"]): person for person in right["people"]}
    fraction = (time - left["time"]) / (right["time"] - left["time"])
    people = []
    # Use nearest observation for appearance/disappearance; interpolation cannot
    # create a person that neither neighboring observation actually contains.
    left_by_id = {str(person["id"]): person for person in left["people"]}
    for person in nearest["people"]:
        identity = str(person["id"])
        interpolated = dict(person)
        if identity in left_by_id and identity in right_by_id:
            interpolated["bbox"] = [
                a + (b - a) * fraction
                for a, b in zip(left_by_id[identity]["bbox"], right_by_id[identity]["bbox"])
            ]
        people.append(interpolated)
    return people


def add_heat(heat: np.ndarray, people: list[dict], seconds: float, kernel: np.ndarray) -> None:
    """Accumulate a finite Gaussian footprint, weighted by actual frame time."""
    height, width = heat.shape
    radius = kernel.shape[0] // 2
    for person in people:
        x, y, w, h = person["bbox"]
        cx, cy = int((x + w / 2) * width), int((y + h / 2) * height)
        left, top = max(0, cx - radius), max(0, cy - radius)
        right, bottom = min(width, cx + radius + 1), min(height, cy + radius + 1)
        if right <= left or bottom <= top:
            continue
        kx, ky = left - (cx - radius), top - (cy - radius)
        heat[top:bottom, left:right] += kernel[ky:ky + bottom-top, kx:kx + right-left] * seconds


def observation_intervals(frames: list[dict], duration: float) -> list[tuple[float, float, list[dict]]]:
    """Preserve the analyzer's exposure weights, including variable/low fps."""
    intervals = []
    for index, frame in enumerate(frames):
        start = float(frame["time"])
        next_time = float(frames[index+1]["time"]) if index+1 < len(frames) else duration
        seconds = float(frame.get("sample_seconds", frame.get("observed_seconds", max(0, next_time-start))))
        seconds = max(0, min(seconds, next_time-start, duration-start))
        if seconds:
            intervals.append((start, start+seconds, frame["people"]))
    return intervals


def heat_layer(frame: np.ndarray, heat: np.ndarray, maximum: float) -> np.ndarray:
    height, width = frame.shape[:2]
    relative = np.clip(heat / max(maximum, .001), 0, 1)
    relative = cv2.resize(relative, (width, height), interpolation=cv2.INTER_LINEAR)
    colors = cv2.applyColorMap(np.uint8(relative * 255), cv2.COLORMAP_JET)
    # Unvisited locations remain transparent, including the cold-color baseline.
    alpha = np.where(relative > .012, np.power(relative, .62) * .66, 0)[..., None]
    return np.uint8(frame.astype(np.float32) * (1 - alpha) + colors.astype(np.float32) * alpha)


def text(frame, value, xy, scale=.5, color=TEXT_COLOR, thickness=1):
    cv2.putText(frame, value, xy, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)


def panel(frame: np.ndarray, box: tuple[int, int, int, int], opacity=.9):
    x0, y0, x1, y1 = box
    region = frame[y0:y1, x0:x1]
    solid = np.full_like(region, PANEL_COLOR)
    frame[y0:y1, x0:x1] = cv2.addWeighted(region, 1-opacity, solid, opacity, 0)


def draw_tracks(frame: np.ndarray, people: list[dict], histories: dict, time: float,
                synthetic: bool, show_trails: bool = True):
    height, width = frame.shape[:2]
    if show_trails:
        layer = frame.copy()
        for identity, history in histories.items():
            if not history or time - history[-1][0] > .5:
                continue
            if len(history) > 1:
                points = np.asarray([p[1] for p in history], dtype=np.int32)
                cv2.polylines(layer, [points], False, history[-1][2], 2, cv2.LINE_AA)
        cv2.addWeighted(layer, .55, frame, .45, 0, dst=frame)
    for person in people:
        x, y, w, h = person["bbox"]
        # Sample detector sees shirt patches, so its visual box is expanded to
        # include the illustrated head and feet. Uploaded detector boxes are unaltered.
        pad_x = .004 if synthetic else 0
        top_pad, bottom_pad = (.028, .012) if synthetic else (0, 0)
        x0, y0 = max(0, int((x-pad_x) * width)), max(0, int((y-top_pad) * height))
        x1, y1 = min(width-1, int((x+w+pad_x) * width)), min(height-1, int((y+h+bottom_pad) * height))
        if x1 <= x0 or y1 <= y0:
            continue
        color = PERSON_COLOR
        overlay = frame.copy()
        cv2.rectangle(overlay, (x0, y0), (x1, y1), color, -1)
        cv2.addWeighted(overlay, .07, frame, .93, 0, dst=frame)
        cv2.rectangle(frame, (x0, y0), (x1, y1), color, 1, cv2.LINE_AA)
        for xa, ya, dx, dy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            cv2.line(frame, (xa, ya), (xa+dx*9, ya), color, 2, cv2.LINE_AA)
            cv2.line(frame, (xa, ya), (xa, ya+dy*9), color, 2, cv2.LINE_AA)
        role_label = 'PERSON'
        label = f"{role_label} {str(person['id'])[:12]}"
        label_width = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, .37, 1)[0][0] + 12
        lx = min(x0, width-label_width-1)
        ly = max(0, y0-23)
        cv2.rectangle(frame, (lx, ly), (lx+label_width, ly+21), PANEL_COLOR, -1)
        cv2.rectangle(frame, (lx, ly), (lx+3, ly+21), color, -1)
        text(frame, label, (lx+8, ly+15), .37, color)


def draw_hud(frame: np.ndarray, people: list[dict], time: float, duration: float,
             synthetic: bool, heatmap: bool, *, public_retail: bool = False,
             footer_height: int = 48):
    height, width = frame.shape[:2]
    panel(frame, (0, 0, width, 53), 1)
    footer_top = height-footer_height
    panel(frame, (0, footer_top, width, height), 1)
    cv2.rectangle(frame, (17, 17), (29, 29), ACCENT_COLOR, -1)
    text(frame, "STORE.AI", (39, 30), .58, TEXT_COLOR, 2)
    text(frame, "CUMULATIVE DWELL HEATMAP" if heatmap else "PERSON TRACKING", (170, 29), .52)
    badge = "PUBLIC RETAIL DEMO" if public_retail else ("SYNTHETIC DEMO" if synthetic else "UPLOADED VIDEO")
    badge_scale = .35 if public_retail else .42
    text(frame, badge, (width-177, 30), badge_scale, ACCENT_COLOR)
    if width >= 1000:
        text(frame, "COLOR-MARKER OBSERVATIONS" if synthetic else "PERSON DETECTOR / REVIEW REQUIRED", (width-506, 29), .32, (171, 188, 174))
    if public_retail:
        text(frame, "MOBILENET SSD / PERSON DETECTION", (170, 45), .27, (171, 188, 174))
    cy = footer_top+28
    cv2.circle(frame, (22, cy-4), 4, PERSON_COLOR, -1)
    text(frame, f"PEOPLE  {len(people):02}", (34, cy), .42)
    time_text = f"{int(time)//60:02}:{int(time)%60:02} / {int(duration)//60:02}:{int(duration)%60:02}"
    text(frame, time_text, (180 if width < 1000 else 325, cy), .43)
    if heatmap:
        legend_width = 116
        lx = width-338
        gradient = np.tile(np.arange(256, dtype=np.uint8), (8, 1))
        gradient = cv2.applyColorMap(gradient, cv2.COLORMAP_JET)
        gradient = cv2.resize(gradient, (legend_width, 8))
        frame[footer_top+17:footer_top+25, lx:lx+legend_width] = gradient
        text(frame, "LOW", (lx, footer_top+40), .25, (176, 191, 180))
        text(frame, "HIGH", (lx+93, footer_top+40), .25, (176, 191, 180))
        text(frame, "RELATIVE DWELL", (width-194, cy-6), .35)
        text(frame, "NOT TEMPERATURE", (width-194, cy+9), .28, (176, 191, 180))
    else:
        text(frame, "ANONYMOUS TRACKS  /  4-SECOND TRAILS", (width-365, cy), .35, (176, 191, 180))
    if public_retail:
        text(frame, "Video: Intel IoT DevKit / sample-videos | CC BY 4.0 | Modified excerpt + annotations",
             (16, footer_top+51), .27, (208, 218, 206))
        text(frame, "Source: github.com/intel-iot-devkit/sample-videos | License: creativecommons.org/licenses/by/4.0/",
             (16, footer_top+65), .25, (176, 191, 180))


class Encoder:
    def __init__(self, path: Path, width: int, height: int, fps: float):
        self.path = path
        self.temporary = path.with_name(path.stem+".partial.mp4")
        self.error = tempfile.TemporaryFile()
        self.process = subprocess.Popen([
            "ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-pixel_format", "bgr24", "-video_size", f"{width}x{height}",
            "-framerate", str(fps), "-i", "pipe:0", "-an", "-c:v", "libx264",
            "-threads", "2", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(self.temporary),
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.error)

    def write(self, frame: np.ndarray):
        self.process.stdin.write(frame.tobytes())

    def close(self, success=True):
        try:
            self.process.stdin.close()
            code = self.process.wait(timeout=60)
            if code or not success:
                self.temporary.unlink(missing_ok=True)
                if success:
                    raise RuntimeError("MP4 rendering failed")
            else:
                self.temporary.replace(self.path)
        finally:
            if self.process.poll() is None:
                self.process.kill()
                self.process.wait()
            self.error.close()


def render_analysis(result: dict, source_path: Path, output_dir: Path) -> dict:
    """Render both videos to output_dir, returning safe URLs for the media API.

    Rendering is a presentation of result['frames'], not a second detector.
    Models sample at 3fps; video output is capped at 15fps. Adjacent observations
    may be interpolated for smooth display, with a 0.4-second visibility limit.
    """
    identity = str(result.get("id", ""))
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", identity):
        raise ValueError("Invalid analysis ID for rendering")
    frames = sorted(result.get("frames", []), key=lambda frame: frame["time"])
    if not frames:
        raise ValueError("No observed frames to render")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(source_path))
    if not cap.isOpened():
        cap.release()
        raise ValueError("Source video could not be opened for rendering")
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = float(cap.get(cv2.CAP_PROP_FPS))
    duration = float(result["source"]["duration"])
    if width < 640 or height < 360:
        scale = max(640 / width, 360 / height)
        width, height = math.ceil(width*scale/2)*2, math.ceil(height*scale/2)*2
    else:
        scale = min(1, 1280/width, 720/height)
        width, height = max(2, int(width*scale)//2*2), max(2, int(height*scale)//2*2)
    fps = min(15., source_fps)
    if not math.isfinite(fps) or fps <= 0 or not 0 < duration <= 121:
        cap.release()
        raise ValueError("Source timing unavailable for rendering")
    timestamps = [frame["time"] for frame in frames]
    synthetic = result["source"].get("kind") == "synthetic"
    public_retail = result["source"].get("kind") == "public-retail"
    # Real footage is never hidden behind a HUD. Draw in source coordinates,
    # then add separate even-height borders for branding and source attribution.
    top_border = 54 if not synthetic else 0
    bottom_border = (70 if public_retail else 48) if not synthetic else 0
    output_height = height+top_border+bottom_border
    heat_shape = (180, 320)
    radius, sigma = 24, 8.
    axis = np.arange(-radius, radius+1, dtype=np.float32)
    kernel = np.exp(-(axis[:, None]**2+axis[None, :]**2)/(2*sigma*sigma)).astype(np.float32)
    final_heat = np.zeros(heat_shape, dtype=np.float32)
    intervals = observation_intervals(frames, duration)
    count = math.ceil(duration*fps)
    # Fixed scale for the complete clip avoids rescaling every frame's hotspots.
    for start, end, observed_people in intervals:
        add_heat(final_heat, observed_people, end-start, kernel)
    maximum = float(final_heat.max()) or 1.
    heat = np.zeros(heat_shape, dtype=np.float32)
    histories = {}
    bbox_path, heat_path = output_dir / f"{identity}-bbox.mp4", output_dir / f"{identity}-heatmap.mp4"
    encoders = []
    source_index, source_frame = -1, None
    interval_index, integrated_until = 0, 0.
    success = False
    try:
        encoders.append(Encoder(bbox_path, width, output_height, fps))
        encoders.append(Encoder(heat_path, width, output_height, fps))
        for i in range(count):
            time = i/fps
            target_index = round(time*source_fps)
            while source_index < target_index:
                ok, decoded = cap.read()
                if not ok:
                    break
                source_frame = decoded
                source_index += 1
            if source_frame is None or source_index < target_index:
                break
            frame = cv2.resize(source_frame, (width, height), interpolation=cv2.INTER_AREA)
            people = people_at(frames, timestamps, time)
            for person in people:
                identity_key = str(person["id"])
                x, y, w, h = person["bbox"]
                point = (int((x+w/2)*width), int((y+h/2)*height))
                color = PERSON_COLOR
                history = histories.setdefault(identity_key, deque(maxlen=max(1, round(fps*4))))
                if history and time-history[-1][0] > .5:
                    history.clear()
                history.append((time, point, color))
            # Heat follows measured sample intervals rather than interpolated
            # tracks. Incremental overlap makes a 2-second source frame carry
            # exactly 2 seconds, while a 3fps observation carries ~1/3 second.
            until = min(duration, time+1/fps)
            while interval_index < len(intervals):
                start, end, observed_people = intervals[interval_index]
                if start >= until:
                    break
                overlap = max(0., min(end, until)-max(start, integrated_until))
                if overlap:
                    add_heat(heat, observed_people, overlap, kernel)
                if end <= until+1e-8:
                    interval_index += 1
                else:
                    break
            integrated_until = until
            bbox_frame = frame.copy()
            draw_tracks(bbox_frame, people, histories, time, synthetic)
            heat_frame = heat_layer(frame, heat, maximum)
            draw_tracks(heat_frame, people, histories, time, synthetic, show_trails=False)
            if top_border:
                bbox_frame = cv2.copyMakeBorder(bbox_frame, top_border, bottom_border, 0, 0, cv2.BORDER_CONSTANT, value=PANEL_COLOR)
                heat_frame = cv2.copyMakeBorder(heat_frame, top_border, bottom_border, 0, 0, cv2.BORDER_CONSTANT, value=PANEL_COLOR)
            draw_hud(bbox_frame, people, time, duration, synthetic, False,
                     public_retail=public_retail, footer_height=bottom_border or 48)
            draw_hud(heat_frame, people, time, duration, synthetic, True,
                     public_retail=public_retail, footer_height=bottom_border or 48)
            encoders[0].write(bbox_frame)
            encoders[1].write(heat_frame)
        success = True
    finally:
        cap.release()
        cleanup_error = None
        for encoder in encoders:
            try:
                encoder.close(success=success)
            except Exception as exc:
                cleanup_error = cleanup_error or exc
        if cleanup_error is not None and success:
            raise cleanup_error
    return {
        "annotated_video_url": f"/media/{bbox_path.name}",
        "heatmap_video_url": f"/media/{heat_path.name}",
        "render_details": {
            "fps": fps,
            "output_width": width,
            "output_height": output_height,
            "source_content_offset_y": top_border,
            "attribution": "Video: Intel IoT DevKit / sample-videos | CC BY 4.0 | Modified excerpt + annotations" if public_retail else None,
            "heatmap": "Measured frame sample_seconds weighted person-observation-seconds with Gaussian spatial smoothing at observed centers; normalized to the clip's maximum. Interpolation does not add heat. Not temperature.",
            "interpolation": "Adjacent tracks interpolated for display only; detections more than 0.4s away are hidden.",
            "audio": False,
        },
    }
