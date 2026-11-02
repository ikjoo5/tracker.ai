"""Default demo must use attributed real footage, not synthetic fallback data."""
import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from server import app as api
from server.analysis import DEFAULT_ZONES
from server.detector import DETECTOR_NAME
from server.exports import detection_csv


class RealRetailDemoTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.data = Path(self.temporary.name)
        for name in ["media", "uploads", "results"]:
            (self.data / name).mkdir()
        self.path = self.data / "demo-retail.mp4"
        writer = cv2.VideoWriter(str(self.path), cv2.VideoWriter_fourcc(*"mp4v"), 2, (320, 240))
        self.assertTrue(writer.isOpened())
        for _ in range(2):
            writer.write(np.full((240, 320, 3), 96, np.uint8))
        writer.release()
        self.zones = copy.deepcopy(DEFAULT_ZONES)
        self.zones[0].update(label="실제 상품 진열대 A", x=.1, w=.3)
        self.provenance = {"title": "Retail fixture", "creator": "Fixture publisher", "source_url": "https://example.org/store.mp4",
                           "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
                           "source_sha256": "a" * 64, "original_start_seconds": 8,
                           "changes": ["Trimmed and resized; no detections added"]}
        self.manifest = {"name": "공개 실제 매장 영상", "kind": "public-retail", "video": "demo-retail.mp4",
                         "zones": self.zones, "provenance": self.provenance}
        self.manifest_path = self.data / "demo-retail.json"
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False))
        self.addCleanup(patch.stopall)
        patch.object(api, "DATA", self.data).start()
        patch.object(api, "jobs", {}).start()
        self.client = TestClient(api.app)

    def test_info_uses_actual_manifest_zones_and_pretrained_detector(self):
        response = self.client.get("/api/demo/info")
        self.assertEqual(response.status_code, 200)
        info = response.json()
        self.assertEqual(info["kind"], "public-retail")
        self.assertEqual(info["detector"], DETECTOR_NAME)
        self.assertEqual(info["video_url"], "/media/demo-retail.mp4")
        self.assertEqual(info["zones"], self.zones)
        self.assertEqual(info["provenance"], self.provenance)
        self.assertEqual(info["source"]["provenance"], self.provenance)
        self.assertAlmostEqual(info["duration"], 1, places=3)

    def test_missing_real_manifest_never_falls_back_to_existing_synthetic(self):
        self.manifest_path.unlink()
        (self.data / "demo-mart.mp4").write_bytes(self.path.read_bytes())
        (self.data / "demo-mart-config.json").write_text('{"markers": []}')
        for method, path in [(self.client.get, "/api/demo/info"), (self.client.post, "/api/demo")]:
            with self.subTest(path=path):
                response = method(path)
                self.assertEqual(response.status_code, 503)
                self.assertIn("scripts/prepare_retail_demo.py", response.json()["detail"])

    def test_synthetic_or_invalid_manifest_is_rejected_by_real_demo(self):
        for value in [[], {**self.manifest, "kind": "synthetic"}, {**self.manifest, "video": "../private.mp4"}, {**self.manifest, "provenance": {}}]:
            with self.subTest(manifest=value):
                self.manifest_path.write_text(json.dumps(value))
                self.assertEqual(self.client.get("/api/demo/info").status_code, 503)

    def test_job_preserves_provenance_and_queues_real_input(self):
        with patch.object(api.executor, "submit") as submit:
            response = self.client.post("/api/demo")
        self.assertEqual(response.status_code, 202)
        queued = response.json()
        self.assertEqual(queued["source"]["kind"], "public-retail")
        self.assertEqual(queued["source"]["provenance"], self.provenance)
        self.assertEqual(submit.call_args.args[2], self.path)
        self.assertEqual(submit.call_args.args[4], "public-retail")
        self.assertEqual(submit.call_args.args[5], self.zones)
        self.assertEqual(submit.call_args.args[6], self.provenance)

    def test_worker_skips_reencoding_and_persists_real_source_before_render(self):
        job_id = "b" * 32
        api.jobs[job_id] = {"id": job_id, "status": "queued"}
        result = {"id": job_id, "status": "completed", "progress": 100,
                  "source": {"name": self.manifest["name"], "kind": "public-retail", "detector": DETECTOR_NAME}, "frames": []}
        with patch.object(api, "analyze_video", return_value=result) as collect, \
             patch.object(api.subprocess, "run") as reencode, \
             patch("server.render.render_analysis", return_value={"annotated_video_url": "/media/test-bbox.mp4", "heatmap_video_url": "/media/test-heatmap.mp4"}) as render:
            api.worker(job_id, self.path, self.manifest["name"], "public-retail", self.zones, self.provenance)
        reencode.assert_not_called()
        self.assertEqual(collect.call_args.kwargs["kind"], "public-retail")
        self.assertEqual(collect.call_args.kwargs["config"], {})
        self.assertEqual(collect.call_args.kwargs["video_url"], "/media/demo-retail.mp4")
        self.assertEqual(render.call_args.args[0]["source"]["provenance"], self.provenance)
        self.assertEqual(render.call_args.args[1], self.path)
        persisted = json.loads((self.data / "results" / f"{job_id}.json").read_text())
        self.assertEqual(persisted["source"]["provenance"], self.provenance)
        self.assertEqual(api.jobs[job_id]["status"], "completed")

    def test_detection_csv_keeps_public_source_attribution(self):
        result = {"id": "test", "source": {"name": "retail", "kind": "public-retail", "detector": DETECTOR_NAME,
                  "width": 320, "height": 240, "provenance": self.provenance},
                  "frames": [{"time": 0, "frame_index": 0, "sample_seconds": .5,
                              "people": [{"id": "T001", "role": "person", "zone": "aisle", "bbox": [.1, .2, .3, .4], "confidence": .9}]}]}
        rows = list(csv.DictReader(io.StringIO(detection_csv(result).lstrip("\ufeff"))))
        self.assertEqual(rows[0]["source_url"], self.provenance["source_url"])
        self.assertEqual(rows[0]["source_license"], "CC BY 4.0")


if __name__ == "__main__":
    unittest.main()
