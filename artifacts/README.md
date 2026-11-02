# Actual-store observation artifacts

These image and video names describe local generated outputs. Duplicate binaries are excluded from Git; website-ready public copies are stored in `public/showcase/`. See the project README for reproduction commands. Existing `store-ai-*` filenames are retained for compatibility with the **tracker.ai** project.

## 3D dwell graphic

- `store-ai-3d-dwell-heatmap.png`: shareable 2200×1740 PNG derived from estimated footpoints and actual observation time.
- `store-ai-3d-dashboard.png`, `store-ai-3d-mobile.png`: interactive workspace screenshots.
- `store-ai-floor-heatmap.json`: calibration points, time-weighted grid, included/excluded observations, and attribution.
- `store-ai-floor-points.csv`: video time, temporary track, floor `u,v` coordinates, and observation weight.

The layout is manually reconstructed from the visible store structure; it is not surveyed. Of 372 observations, 296 were projected. Cropped feet excluded 59 observations, and 17 fell outside the floor. The map includes 98.665 of the original 123.996 person-seconds. Colors are relative within the selected interval.

The earlier video heatmap accumulates image-space BBox centers, so its reference differs from the new footpoint-based floor graphic.

With the API and Vite running, `node scripts/capture-floor.mjs` re-renders stored actual observations and saves PNGs and screenshots. It does not rerun the detector.

## Actual public housewares-store sample

- `store-ai-real-bbox.mp4`: actual pretrained person detections, temporary IDs, and movement trails.
- `store-ai-real-heatmap.mp4`: earlier image-space observation-time heatmap.
- `store-ai-real-analysis.json`, `store-ai-real-detections.csv`: raw observations and attribution.
- `store-ai-real-bbox.jpg`, `store-ai-real-heatmap.jpg`: result previews.

Source: [Intel IoT DevKit / sample-videos](https://github.com/intel-iot-devkit/sample-videos/blob/57978890822836f2b4743852f04f62fc511757e4/store-aisle-detection.mp4), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Original time 00:08–01:00 was converted to a silent 52-second, 15 fps excerpt. Analysis overlays and attribution borders were added. It depicts a housewares store, not a grocery aisle. The license copy is `docs/licenses/intel-sample-videos-CC-BY-4.0.txt`.

Missed detections, ID fragmentation, and ID changes remain. Track counts are not visitor counts. Neither heatmap is a calibrated physical floor density or evidence of purchase intent.

## Earlier test outputs

The synthetic store and outdoor pedestrian files are not the default public demo. They may remain in a development workspace after earlier validation runs:

- `store-ai-bbox-demo.mp4`, `store-ai-heatmap-demo.mp4`, `store-ai-heatmap.jpg`: original synthetic-store color-marker tests.
- `store-ai-demo-analysis.json`, `store-ai-detections.csv`: synthetic observations.
- `person-bbox-demo.mp4`, `person-heatmap-demo.mp4`: pretrained detector checks using the first 12 seconds of [OpenCV’s public vtest.avi](https://github.com/opencv/opencv/blob/4.12.0/samples/data/vtest.avi).
- `pretrained-validation/analysis.json`, `pretrained-validation/detections.csv`: those pedestrian-test observations.

Synthetic color detection and pretrained person detection are different methods. Neither test establishes retail accuracy; the actual camera needs ground-truth labels to evaluate misses, occlusion, and tracking error.
