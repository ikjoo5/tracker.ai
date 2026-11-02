"""Meaningful deterministic checks, run with python -m unittest discover -s tests."""
import tempfile
from pathlib import Path
import unittest

import cv2
import numpy as np
from fastapi.testclient import TestClient

from server.analysis import analyze_video, probe_video, synthetic_detections, zone_for, DEFAULT_ZONES
from server.app import app, validate_zones


class AnalysisTests(unittest.TestCase):
    def test_pixels_control_sample_detection(self):
        marker = {"id": "P01", "role": "person", "color": [89, 182, 161]}
        blank = np.zeros((240, 320, 3), dtype=np.uint8)
        self.assertEqual(synthetic_detections(blank, [marker]), [])
        cv2.rectangle(blank, (100, 80), (125, 120), (161, 182, 89), -1)
        result = synthetic_detections(blank, [marker])
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result[0]["bbox"][0], 100 / 320)

    def test_zone_dwell_derived_from_decoded_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.avi"
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 6, (320, 240))
            for i in range(36):
                image = np.zeros((240, 320, 3), dtype=np.uint8)
                x, y = (176, 60) if i < 18 else (176, 144)
                cv2.rectangle(image, (x - 8, y - 10), (x + 8, y + 10), (161, 182, 89), -1)
                writer.write(image)
            writer.release()
            result = analyze_video(path, analysis_id="test", name="test", kind="synthetic",
                                   config={"markers": [{"id": "P01", "role": "person", "color": [89, 182, 161]}]})
            self.assertEqual(result["metrics"]["unique_people"], 1)
            self.assertAlmostEqual(result["metrics"]["total_person_seconds"], 6, delta=.01)
            self.assertAlmostEqual(result["tracks"][0]["zone_seconds"]["aisle"], 3, delta=.35)
            self.assertAlmostEqual(result["tracks"][0]["zone_seconds"]["checkout"], 3, delta=.35)
            self.assertTrue(any(e["type"] == "zone_change" and e["zone"] == "checkout" for e in result["events"]))
            self.assertAlmostEqual(sum(zone["person_seconds"] for zone in result["zone_dwell"]), 6, delta=.01)
            self.assertGreater(len(result["frames"]), 10)

    def test_invalid_video_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.mp4"
            path.write_text("this is not a movie")
            with self.assertRaises(ValueError):
                probe_video(path)

    def test_zone_assignment(self):
        self.assertEqual(zone_for((.2, .2), DEFAULT_ZONES), "produce")
        self.assertEqual(zone_for((.55, .6), DEFAULT_ZONES), "checkout")
        self.assertEqual(zone_for((.99, .99), DEFAULT_ZONES), "other")


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)

    def test_reject_fake_mp4(self):
        response = self.client.post("/api/analyses", files={"file": ("fake.mp4", b"not a video", "video/mp4")})
        self.assertEqual(response.status_code, 422)

    def test_reject_nonvideo_and_bad_zones(self):
        response = self.client.post("/api/analyses", files={"file": ("notes.txt", b"hello", "text/plain")})
        self.assertEqual(response.status_code, 415)
        response = self.client.post("/api/analyses", files={"file": ("test.mp4", b"fake", "video/mp4")}, data={"zones": "[]"})
        self.assertEqual(response.status_code, 422)

    def test_missing_result(self):
        self.assertEqual(self.client.get("/api/analyses/unknown").status_code, 404)


if __name__ == "__main__":
    unittest.main()
