import fs from 'node:fs';
import { buildFloorHeatmap, DEFAULT_FLOOR_CALIBRATION } from '../src/floorProjection.ts';

const input = process.argv[2] || 'artifacts/store-ai-real-analysis.json';
const result = JSON.parse(fs.readFileSync(input, 'utf8'));
if (result.source.kind !== 'public-retail' || !result.source.provenance?.source_url?.includes('intel-iot-devkit/sample-videos')) {
  throw new Error('The supplied calibration is specific to the attributed Intel housewares clip. Configure another camera separately.');
}
const heatmap = buildFloorHeatmap(result.frames, {
  calibration: DEFAULT_FLOOR_CALIBRATION, startTime: 0, endTime: result.source.duration, width: 128, height: 160, sigma: .04,
});
const output = {
  analysis_id: result.id, source: result.source, method: 'Manual homography of estimated BBox bottom-center footpoints; observation-time weighted Gaussian grid',
  coordinate_system: 'Unitless normalized floor coordinates u,v in [0,1]. Far edge v=0, camera/front edge v=1. Not metres.',
  limitations: ['Floor corners and shelf layout are manually approximated, not surveyed or automatically reconstructed.',
    'Clipped BBox bottoms and points outside the selected floor are excluded.', 'Detection misses and track fragmentation remain.',
    'This grid differs from the old video heatmap, which accumulated image-space BBox centers.'],
  ...heatmap,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/store-ai-floor-heatmap.json', JSON.stringify(output, null, 2) + '\n');
const header = 'track_id,time_seconds,u,v,observed_seconds';
fs.writeFileSync('artifacts/store-ai-floor-points.csv', '\ufeff' + header + '\n' + heatmap.points.map(p =>
  [JSON.stringify(String(p.trackId)), p.time, p.u, p.v, p.seconds].join(',')).join('\n') + '\n');
console.log(JSON.stringify({ observations: heatmap.totalObservations, mapped: heatmap.acceptedObservations,
  clippedFeet: heatmap.clippedFootObservations, outsideFloor: heatmap.outsideFloorObservations,
  observedPersonSeconds: heatmap.observedPersonSeconds, mappedPersonSeconds: heatmap.mappedPersonSeconds,
  excludedPersonSeconds: heatmap.excludedPersonSeconds, gridSum: heatmap.grid.reduce((a, b) => a + b, 0) }, null, 2));
