# Validation record

Validation covers installation, execution, observation collection, time-weighted aggregation, exports, and the public site. It does not establish detector accuracy, tracking continuity, or real-world dwell-time error. No retail-specific training or fine-tuning has been performed.

## Installation and core checks

- `bash scripts/setup.sh`: isolated Python installation, model SHA-256 verification, `npm ci`, and frontend build completed.
- `.venv/bin/python -m unittest discover -s tests -v`: 24 backend tests passed.
- `npm run test:floor`: 14 floor-projection cases passed.
- `npm run build`: passed. The Three.js workspace chunk-size advisory is not a build failure.

The tests include invalid uploads, bounded zones, real sample metadata, rejection of silent synthetic fallback, actual time intervals at low/non-divisible frame rates, data attribution, coordinate exports, homography corners, degenerate calibration rejection, cropped/outside observations, empty grids, a 512×512 grid, and conservation of observation weights.

## Actual public store sample

The CC BY 4.0 Intel `store-aisle-detection.mp4` source was verified by SHA-256. Original time 00:08–01:00 was converted to a silent, 52-second, 15 fps excerpt. The default API uses this actual file and attribution metadata. If it is missing, the API returns 503 rather than substituting the available synthetic sample.

The pretrained detector collected:

| Measurement | Result |
| --- | ---: |
| Sampled frames | 156 |
| Detection observations | 372 |
| Temporary tracks | 18, including 16 observed at least twice |
| Total observation time | 123.996 person-seconds |
| Projected observations | 296 |
| Projected time | 98.665 person-seconds |
| Excluded observations | 59 cropped-foot + 17 outside-floor observations |
| Excluded time | 25.331 person-seconds |

The sum of zone observation times matches total observation time. The projected grid sums to the included person-seconds. Temporary track fragmentation means 18 IDs must not be interpreted as 18 visitors.

BBox and earlier image-space heatmap MP4s were opened and checked at H.264, 720×528, 15 fps, and 52 seconds. The output adds a 54 px header and a 70 px footer without covering the source frame. Attribution is retained in MP4, JSON, and CSV. MP4 range requests were also checked.

## Interactive workspace checks

`node scripts/browser-smoke.mjs` passed with the actual public sample: `source.kind=public-retail`, MobileNet-SSD, CC BY 4.0 attribution, BBox-to-3D navigation, zone filters, CSV download, no mobile horizontal overflow, and no browser page exceptions.

Earlier integration checks also uploaded an actual public pedestrian clip, verified pretrained inference, and downloaded its CSV and MP4 outputs. That outdoor clip was a functional detector check, not a retail accuracy evaluation.

## 3D map and PNG checks

- `npm run export:floor`: actual projected observations and their time-weighted grid were exported; included time and grid sum agree.
- `node scripts/capture-floor.mjs`: recorded actual observations were rendered in WebGL. Camera view, shelf visibility, and time filtering changed the displayed graphic or aggregation as expected.
- PNG download, mobile canvas sizing, and zero page exceptions were checked.
- The shared PNG includes a legend, source attribution, included/excluded amounts, and the manual-calibration limitation.

The floor calibration is specific to the Intel clip. A different video receives a calibration-required message rather than inheriting this projection. The 3D shelf layout is a manual illustration, not a measured or automatically reconstructed scene.

## Static project website

`node scripts/test-site.mjs` passed against the `/tracker.ai/` preview path. Checks covered:

- Images decode successfully, and generated scenarios are labeled as concepts.
- Actual raw/BBox comparison, pipeline stage selection, and concept/measured 3D views work.
- CSV download and the 52-second demo video work.
- The read-only workspace loads recorded data without local API requests.
- Mobile navigation and document width work without page exceptions.

The observation-accumulation graphic uses actual 13-, 26-, and 52-second prefixes with a shared full-clip color scale. The crowded BBox and expanded-store heatmap images are explanatory generated assets, not model-performance evidence.

English localization and the tracker.ai rebrand preserve the measured observations. Language-specific browser selectors and generated images are revalidated as part of that update. Source publication and live Pages publication remain separate checks; live deployment is not asserted until verified.
