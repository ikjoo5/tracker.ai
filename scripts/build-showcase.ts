/** Package measured, attributed examples for the static public project page. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildFloorHeatmap, DEFAULT_FLOOR_CALIBRATION } from '../src/floorProjection.ts';

const root = process.cwd();
const output = path.join(root, 'public/showcase');
fs.mkdirSync(output, { recursive: true });
const result = JSON.parse(fs.readFileSync('artifacts/store-ai-real-analysis.json', 'utf8'));
if (result.source.kind !== 'public-retail' || result.source.provenance?.license !== 'CC BY 4.0') throw new Error('Expected attributed actual retail observations');
const clip = 'server/data/demo-retail.mp4';
const options = { calibration: DEFAULT_FLOOR_CALIBRATION, startTime: 0, width: 128, height: 160, sigma: .04 };
const stages = [13, 26, 52].map(end => {
  const heat = buildFloorHeatmap(result.frames, { ...options, endTime: end });
  const prefix = result.frames.filter((f: { time: number }) => f.time < end);
  return { end, sampledFrames: prefix.length, detections: heat.totalObservations,
    mappedObservations: heat.acceptedObservations, mappedPersonSeconds: heat.mappedPersonSeconds,
    excludedPersonSeconds: heat.excludedPersonSeconds, grid: heat.grid, width: heat.width, height: heat.height, max: heat.max };
});
const full = stages[stages.length - 1];
const rows = result.frames.flatMap((frame: { time: number; sample_seconds: number; people: { id: string; bbox: number[]; confidence: number; zone: string }[] }) => frame.people.map(person => ({
  time: frame.time, time_seconds: frame.time, track_id: person.id, bbox: person.bbox,
  confidence: person.confidence, zone: person.zone, sample_seconds: frame.sample_seconds,
}))).slice(0, 6);
const preview = {
  source: result.source, provenance: result.source.provenance,
  metrics: { ...result.metrics, duration: result.source.duration, frames: result.frames.length,
    mappedObservations: full.mappedObservations, mappedPersonSeconds: full.mappedPersonSeconds,
    excludedPersonSeconds: full.excludedPersonSeconds },
  rows, records: rows, floor: { calibration: DEFAULT_FLOOR_CALIBRATION, mappedObservations: full.mappedObservations,
    mappedPersonSeconds: full.mappedPersonSeconds, excludedPersonSeconds: full.excludedPersonSeconds,
    note: 'Manual perspective example and reconstructed layout, not surveyed measurements.' },
  accumulation: stages.map(({ grid: _grid, ...stage }) => stage),
};
fs.writeFileSync(path.join(output, 'observation-preview.json'), JSON.stringify(preview, null, 2) + '\n');
const packaged = { ...result, video_url: 'showcase/demo-source.mp4', annotated_video_url: 'showcase/demo-bbox.mp4' };
delete packaged.heatmap_video_url;
packaged.artifact_files = { annotated_video_url: 'demo-bbox.mp4', heatmap_png: 'dwell-3d.png' };
fs.writeFileSync(path.join(output, 'analysis.json'), JSON.stringify(packaged, null, 2) + '\n');
run(path.join(root, '.venv/bin/python'), ['-c', 'import json,sys; from pathlib import Path; from server.exports import detection_csv; result=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")); Path(sys.argv[2]).write_text(detection_csv(result),encoding="utf-8")', 'artifacts/store-ai-real-analysis.json', path.join(output, 'detections.csv')]);
fs.copyFileSync(path.join(output, 'detections.csv'), path.join(output, 'observation-data.csv'));
fs.copyFileSync(path.join(output, 'analysis.json'), path.join(output, 'observation-data.json'));
// The marked image is extracted at the same timestamp as the unmarked example below.
fs.copyFileSync('artifacts/store-ai-3d-dwell-heatmap.png', path.join(output, 'dwell-3d.png'));
fs.copyFileSync('artifacts/store-ai-real-bbox.mp4', path.join(output, 'demo-bbox.mp4'));
fs.copyFileSync('docs/licenses/intel-sample-videos-CC-BY-4.0.txt', path.join(output, 'license.txt'));
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({
  ...result.source.provenance, public_assets: {
    'retail-frame.jpg': 'Actual source frame, clip time 22s / original time 30s.',
    'retail-bbox.jpg': 'Actual detector/tracker output at clip time 22s / original time 30s; attribution overlay added.',
    'dwell-3d.png': 'Actual projected footpoints and duration, manually reconstructed scene, not surveyed floorplan.',
    'accumulation.png': 'Real observation prefixes 0–13/26/52 seconds, same maximum color scale; no invented observations.',
    'demo-source.mp4': '52-second actual source excerpt, muted, resampled to 15fps, compressed for static preview.',
    'demo-bbox.mp4': 'Actual 52-second detector/tracker output with source attribution.',
  },
}, null, 2) + '\n');
function run(program: string, args: string[]) {
  const process = spawnSync(program, args, { stdio: 'inherit' });
  if (process.status !== 0) throw new Error(`${program} failed (${process.status})`);
}
run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '22', '-i', clip, '-frames:v', '1', '-q:v', '2', path.join(output, 'retail-frame.jpg')]);
run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '22', '-i', 'artifacts/store-ai-real-bbox.mp4', '-frames:v', '1', '-q:v', '2', path.join(output, 'retail-bbox.jpg')]);
run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', clip, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-threads', '2', '-movflags', '+faststart', path.join(output, 'demo-source.mp4')]);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-showcase-'));
try {
  const dataFile = path.join(temporary, 'stages.json');
  fs.writeFileSync(dataFile, JSON.stringify({ stages, source: result.source, fullMax: full.max }));
  run(path.join(root, '.venv/bin/python'), ['scripts/render-showcase-figure.py', dataFile, path.join(output, 'accumulation.png')]);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ output, measuredDetections: result.metrics.detections, frames: result.frames.length,
  duration: result.source.duration, mappedObservations: full.mappedObservations,
  sourceBytes: fs.statSync(path.join(output, 'demo-source.mp4')).size,
  stages: stages.map(stage => ({ end: stage.end, detections: stage.detections, mapped: stage.mappedObservations, personSeconds: stage.mappedPersonSeconds })) }, null, 2));
