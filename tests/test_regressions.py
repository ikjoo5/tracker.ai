"""Checks for measured-time and local API boundary regressions."""
import json
import csv
import io
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
from fastapi import HTTPException

from server.analysis import analyze_video, DEFAULT_ZONES
from server.app import validate_zones
from server.exports import detection_csv, DETECTION_FIELDS
from server.render import add_heat, heat_layer, observation_intervals, people_at


class ObservationTimeRegressionTests(unittest.TestCase):
    def test_non_divisible_fps_exposures_cover_source_clock(self):
        """7fps sampled at 3fps has unequal intervals, still exactly one second."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'seven-fps.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 7, (320, 240))
            self.assertTrue(writer.isOpened())
            for _ in range(7):
                image = np.zeros((240, 320, 3), dtype=np.uint8)
                cv2.rectangle(image, (165, 50), (185, 78), (161, 182, 89), -1)
                writer.write(image)
            writer.release()
            result = analyze_video(path, analysis_id='sevenfps', name='sevenfps', kind='synthetic',
                config={'markers': [{'id': 'C01', 'color': [89, 182, 161], 'role': 'person'}]})
            frames = result['frames']
            self.assertEqual([f['frame_index'] for f in frames], [0, 3, 5])
            self.assertAlmostEqual(sum(f['sample_seconds'] for f in frames), 1, places=5)
            self.assertNotEqual(frames[0]['sample_seconds'], frames[1]['sample_seconds'])
            self.assertAlmostEqual(result['metrics']['total_person_seconds'], 1, places=3)
            self.assertAlmostEqual(result['tracks'][0]['observed_seconds'], 1, places=2)

    def test_low_fps_zone_time_is_wall_clock_seconds(self):
        """A six-second 1fps clip must not become two seconds of aisle dwell."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'one-fps.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 1, (320, 240))
            self.assertTrue(writer.isOpened())
            for _ in range(6):
                image = np.zeros((240, 320, 3), dtype=np.uint8)
                cv2.rectangle(image, (165, 50), (185, 78), (161, 182, 89), -1)
                writer.write(image)
            writer.release()
            result = analyze_video(path, analysis_id='lowfps', name='lowfps', kind='synthetic',
                config={'markers': [{'id': 'C01', 'color': [89, 182, 161], 'role': 'person'}]})
            self.assertEqual(result['metrics']['unique_people'], 1)
            self.assertAlmostEqual(result['tracks'][0]['zone_seconds']['aisle'], 6, delta=.2)
            self.assertAlmostEqual(result['tracks'][0]['observed_seconds'], 6, delta=.2)

    def test_zone_extent_cannot_escape_image(self):
        zones = [dict(z) for z in DEFAULT_ZONES]
        zones[0].update(x=.8, w=.4)
        with self.assertRaises(HTTPException) as raised:
            validate_zones(json.dumps(zones))
        self.assertEqual(raised.exception.status_code, 422)

    def test_non_finite_zone_coordinates_rejected(self):
        zones = [dict(z) for z in DEFAULT_ZONES]
        zones[0]['x'] = float('nan')
        with self.assertRaises(HTTPException):
            validate_zones(json.dumps(zones))


class DetectionExportRegressionTests(unittest.TestCase):
    def test_csv_preserves_detection_provenance_units_and_scores(self):
        result = {
            'id': 'a' * 32,
            'source': {'name': '마트, 오후.mp4', 'kind': 'upload', 'detector': 'mobilenet-ssd', 'width': 640, 'height': 360},
            'frames': [{'time': .25, 'frame_index': 8, 'sample_seconds': .375,
                        'people': [{'id': 'T001', 'role': 'person', 'zone': 'aisle',
                                    'bbox': [.1, .2, .3, .4], 'confidence': .82}]}],
        }
        content = detection_csv(result)
        self.assertTrue(content.startswith('\ufeff'))
        reader = csv.DictReader(io.StringIO(content.lstrip('\ufeff')))
        rows = list(reader)
        self.assertEqual(reader.fieldnames, DETECTION_FIELDS)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['analysis_id'], 'a' * 32)
        self.assertEqual(row['source_name'], '마트, 오후.mp4')
        self.assertEqual(row['source_kind'], 'upload')
        self.assertEqual(row['detector'], 'mobilenet-ssd')
        self.assertEqual(row['track_id'], 'T001')
        self.assertEqual(row['role'], 'person')
        self.assertEqual(row['zone'], 'aisle')
        self.assertEqual(int(row['frame_index']), 8)
        self.assertEqual(float(row['time_seconds']), .25)
        self.assertEqual(float(row['sample_seconds']), .375)
        self.assertEqual(float(row['confidence']), .82)
        self.assertEqual(float(row['bbox_x']), .1)
        self.assertEqual(float(row['bbox_x_px']), 64)
        self.assertEqual(float(row['bbox_y_px']), 72)
        self.assertEqual(float(row['bbox_width_px']), 192)
        self.assertEqual(float(row['bbox_height_px']), 144)

    def test_zero_detections_exports_header_without_fabricated_rows(self):
        result = {'id': 'empty', 'source': {'name': 'empty.mp4', 'kind': 'upload', 'detector': 'mobilenet-ssd', 'width': 640, 'height': 360},
                  'frames': [{'time': 0, 'frame_index': 0, 'sample_seconds': .333, 'people': []}]}
        reader = csv.DictReader(io.StringIO(detection_csv(result).lstrip('\ufeff')))
        self.assertEqual(list(reader), [])
        self.assertEqual(reader.fieldnames, DETECTION_FIELDS)


class HeatmapRegressionTests(unittest.TestCase):
    def test_actual_exposure_weights_control_heat(self):
        people = [{'id': 'T001', 'bbox': [.4, .4, .2, .2]}]
        short, long = np.zeros((20, 20), dtype=np.float32), np.zeros((20, 20), dtype=np.float32)
        kernel = np.ones((3, 3), dtype=np.float32)
        add_heat(short, people, .5, kernel)
        add_heat(long, people, 2, kernel)
        np.testing.assert_allclose(long, short * 4)
        self.assertEqual(float(long[10, 10]), 2)

    def test_intervals_preserve_long_low_fps_samples_and_clip_end(self):
        frames = [{'time': 0, 'sample_seconds': 2, 'people': []},
                  {'time': 2, 'sample_seconds': 2, 'people': []},
                  {'time': 4, 'sample_seconds': 2, 'people': []}]
        intervals = observation_intervals(frames, 4.5)
        self.assertEqual([(start, end) for start, end, _ in intervals], [(0, 2), (2, 4), (4, 4.5)])

    def test_display_does_not_bridge_long_detection_gap(self):
        person = {'id': 'T001', 'bbox': [.1, .1, .2, .3]}
        frames = [{'time': 0, 'people': [person]}, {'time': 2, 'people': [person]}]
        self.assertEqual(people_at(frames, [0, 2], 1), [])
        self.assertEqual(people_at(frames, [0, 2], 0)[0]['bbox'], person['bbox'])

    def test_unvisited_heatmap_is_fully_transparent(self):
        image = np.full((20, 20, 3), 125, dtype=np.uint8)
        result = heat_layer(image, np.zeros((10, 10), dtype=np.float32), 1)
        np.testing.assert_array_equal(result, image)


if __name__ == '__main__':
    unittest.main()
