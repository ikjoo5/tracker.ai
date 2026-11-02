"""Local Store AI collection API. Run: uvicorn server.app:app --port 8000."""
from __future__ import annotations

import csv
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .analysis import DEFAULT_ZONES, analyze_video, probe_video
from .detector import DETECTOR_NAME, MODEL_REVISION, verified_model_files
from .exports import detection_csv

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("STORE_DATA_DIR", os.environ.get("CAFE_DATA_DIR", str(ROOT / "server" / "data"))))
for directory in [DATA, DATA / "uploads", DATA / "media", DATA / "results"]:
    directory.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = 100 * 1024 * 1024
EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
jobs: dict[str, dict] = {}
lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="video-analysis")

app = FastAPI(title="Store AI", version="0.1.0", description="Local frame-based mart person observations")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])


def validate_zones(raw: str | None) -> list[dict]:
    if not raw:
        return DEFAULT_ZONES
    try:
        zones = json.loads(raw)
        if not isinstance(zones, list) or len(zones) != 4:
            raise ValueError()
        if {z["id"] for z in zones} != {"produce", "aisle", "checkout", "household"}:
            raise ValueError()
        for z in zones:
            for key in ["x", "y", "w", "h"]:
                if not isinstance(z[key], (int, float)) or not 0 <= z[key] <= 1:
                    raise ValueError()
            if z["w"] < .02 or z["h"] < .02 or z["x"] + z["w"] > 1.001 or z["y"] + z["h"] > 1.001:
                raise ValueError()
            # Preserve only known presentation fields; never interpolate user paths.
            z["label"] = str(z.get("label", z["id"]))[:40]
            z["color"] = str(z.get("color", "#809be0"))[:30]
        return zones
    except (TypeError, ValueError, KeyError):
        raise HTTPException(422, "구역은 produce, aisle, checkout, household 네 개의 정규화된 사각형이어야 합니다.")


def update_job(job_id: str, **values):
    with lock:
        jobs[job_id].update(values)


def worker(job_id: str, path: Path, name: str, kind: str, zones: list[dict], provenance: dict | None = None):
    try:
        update_job(job_id, status="processing", progress=1, stage="preparing")
        video_path = path
        video_url = {"synthetic": "/media/demo-mart.mp4", "public-retail": "/media/demo-retail.mp4"}.get(kind, f"/media/{job_id}.mp4")
        config = {}
        if kind == "synthetic":
            config = json.loads((DATA / "demo-mart-config.json").read_text())
        elif kind == "upload":
            video_path = DATA / "media" / f"{job_id}.mp4"
            # Normalize to browser-playable H.264; no network or shell command expansion.
            proc = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
                                   "-an", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast",
                                   "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video_path)],
                                  capture_output=True, timeout=180)
            if proc.returncode:
                raise ValueError("영상을 재생 가능한 MP4로 변환하지 못했습니다. 다른 코덱으로 저장해 주세요.")
        elif kind != "public-retail":
            raise ValueError("지원하지 않는 영상 수집 유형입니다.")
        update_job(job_id, stage="detecting")
        result = analyze_video(path, analysis_id=job_id, name=name, kind=kind, zones=zones, config=config,
                               progress=lambda p: update_job(job_id, progress=round(p * .8, 1)), video_url=video_url)
        if provenance is not None:
            result["source"]["provenance"] = provenance
        update_job(job_id, progress=80, stage="rendering")
        from .render import render_analysis
        result.update(render_analysis(result, video_path, DATA / "media"))
        result["stage"] = "completed"
        destination = DATA / "results" / f"{job_id}.json"
        destination.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        with lock:
            jobs[job_id] = result
    except Exception as exc:
        # Only expected operational messages reach the UI, not local file paths or tracebacks.
        message = str(exc) if isinstance(exc, ValueError) else "영상 분석 중 오류가 발생했습니다. 파일 형식과 샘플 설치 상태를 확인해 주세요."
        update_job(job_id, status="failed", error=message, progress=0)


def queue_job(path: Path, name: str, kind: str, zones: list[dict], provenance: dict | None = None) -> dict:
    with lock:
        active = sum(j.get("status") in {"queued", "processing"} for j in jobs.values())
        if active >= 5:
            raise HTTPException(429, "분석 대기열이 가득 찼습니다. 현재 분석이 끝난 후 다시 시도해 주세요.")
        job_id = uuid.uuid4().hex
        jobs[job_id] = {"id": job_id, "status": "queued", "progress": 0, "source": {"name": name, "kind": kind}}
        if provenance is not None:
            jobs[job_id]["source"]["provenance"] = provenance
        response = dict(jobs[job_id])
    executor.submit(worker, job_id, path, name, kind, zones, provenance)
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "detectors": ["synthetic-color-markers", DETECTOR_NAME], "pretrained_model_ready": verified_model_files(), "max_duration_seconds": 120, "max_upload_mb": 100}


def retail_demo_spec() -> tuple[Path, dict, list[dict], dict]:
    """Real footage is the default; a missing manifest must never select artwork."""
    guidance = "공개 실제 매장 데모가 준비되지 않았습니다. python scripts/prepare_retail_demo.py 명령을 실행해 주세요."
    try:
        manifest = json.loads((DATA / "demo-retail.json").read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("kind") != "public-retail" or manifest.get("video") != "demo-retail.mp4":
            raise ValueError("Invalid real-demo manifest")
        if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
            raise ValueError("Missing source name")
        provenance = manifest.get("provenance")
        if not isinstance(provenance, dict) or not all(isinstance(provenance.get(key), str) and provenance[key] for key in ["title", "creator", "source_url", "license", "license_url", "source_sha256"]):
            raise ValueError("Missing source attribution")
        zones = validate_zones(json.dumps(manifest["zones"]))
        path = DATA / manifest["video"]
        metadata = probe_video(path)
        return path, manifest, zones, metadata
    except (OSError, ValueError, TypeError, KeyError, HTTPException):
        raise HTTPException(503, guidance)


@app.get("/api/demo/info")
def demo_info():
    path, manifest, zones, metadata = retail_demo_spec()
    source = {"name": manifest["name"], "kind": "public-retail", **metadata,
              "detector": DETECTOR_NAME, "model_revision": MODEL_REVISION, "provenance": manifest["provenance"]}
    return {**source, "source": source, "video_url": f"/media/{path.name}", "zones": zones}


@app.post("/api/demo", status_code=202)
def demo():
    path, manifest, zones, _ = retail_demo_spec()
    return queue_job(path, manifest["name"], "public-retail", zones, manifest["provenance"])


@app.post("/api/demo/synthetic", status_code=202)
def synthetic_demo():
    """An explicitly selected synthetic test fixture, never a real-footage fallback."""
    path = DATA / "demo-mart.mp4"
    if not path.exists() or not (DATA / "demo-mart-config.json").exists():
        raise HTTPException(503, "샘플이 아직 준비되지 않았습니다. python scripts/generate_sample.py 명령을 실행해 주세요.")
    return queue_job(path, "MART 01 · 합성 CCTV 샘플", "synthetic", DEFAULT_ZONES)


@app.post("/api/analyses", status_code=202)
async def upload(file: UploadFile = File(...), zones: str | None = Form(None)):
    chosen_zones = validate_zones(zones)
    name = Path((file.filename or "video.mp4").replace("\\", "/")).name
    extension = Path(name).suffix.lower()
    if extension not in EXTENSIONS:
        raise HTTPException(415, "지원하는 영상 형식: MP4, MOV, AVI, MKV, WebM, M4V")
    path = DATA / "uploads" / f"{uuid.uuid4().hex}{extension}"
    size = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(413, "100MB 이하의 영상만 업로드할 수 있습니다.")
                output.write(chunk)
        if size == 0:
            raise HTTPException(422, "비어 있는 파일입니다.")
        try:
            probe_video(path)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return queue_job(path, name[:160], "upload", chosen_zones)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


def get_result(job_id: str) -> dict:
    if not job_id.isalnum() or len(job_id) != 32:
        raise HTTPException(404, "분석 결과를 찾을 수 없습니다.")
    with lock:
        current = jobs.get(job_id)
    if current is not None:
        return current
    result_path = DATA / "results" / f"{job_id}.json"
    if result_path.exists():
        return json.loads(result_path.read_text(encoding="utf-8"))
    raise HTTPException(404, "분석 결과를 찾을 수 없습니다.")


@app.get("/api/analyses/{job_id}")
def get_analysis(job_id: str):
    return get_result(job_id)


@app.get("/api/analyses/{job_id}/export")
def export_analysis(job_id: str, format: str = Query("json", pattern="^(json|csv|summary_csv)$")):
    result = get_result(job_id)
    if result["status"] != "completed":
        raise HTTPException(409, "분석이 완료된 후 다운로드할 수 있습니다.")
    if format == "json":
        content = json.dumps(result, ensure_ascii=False, indent=2)
        media_type = "application/json"
    elif format == "csv":
        content = detection_csv(result)
        media_type = "text/csv"
    else:
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=["time", "label", "people"])
        writer.writeheader()
        writer.writerows(result["series"])
        content = "\ufeff" + stream.getvalue()
        media_type = "text/csv"
    suffix = "json" if format == "json" else "csv"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="store-analysis-{job_id}.{suffix}"'})


@app.get("/media/{filename}")
def media(filename: str):
    if filename in {"demo-retail.mp4", "demo-mart.mp4"}:
        path = DATA / filename
    elif re.fullmatch(r"[a-f0-9]{32}(?:-bbox|-heatmap)?\.mp4", filename):
        path = DATA / "media" / filename
    else:
        raise HTTPException(404, "영상을 찾을 수 없습니다.")
    if not path.is_file():
        raise HTTPException(404, "영상을 찾을 수 없습니다.")
    return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "private, max-age=3600"})


# A production frontend build can be served by this single process.
dist = ROOT / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
