import assert from 'node:assert/strict';
import { buildFloorHeatmap, DEFAULT_FLOOR_CALIBRATION, footpointOf, projectObservation, solveHomography, type FloorCalibration } from '../src/floorProjection.ts';

const identity: FloorCalibration = { name: 'identity fixture', imagePoints: [[0,0],[1,0],[1,1],[0,1]], floorPoints: [[0,0],[1,0],[1,1],[0,1]], approximate: false };
const near = (a: number, b: number, label = '') => assert.ok(Math.abs(a-b)<1e-8, `${label}: ${a} != ${b}`);
let checks = 0;
for (let i=0; i<4; i++) {
  const projected = projectObservation(DEFAULT_FLOOR_CALIBRATION.imagePoints[i], DEFAULT_FLOOR_CALIBRATION)!;
  near(projected[0], DEFAULT_FLOOR_CALIBRATION.floorPoints[i][0]);
  near(projected[1], DEFAULT_FLOOR_CALIBRATION.floorPoints[i][1]);
  checks++;
}
assert.equal(projectObservation([-.1,.5], identity), null); checks++;
assert.equal(footpointOf([.2,.3,.1,.2])?.[1], .5); checks++;
assert.equal(footpointOf([0,0,Number.NaN,.2]), null); checks++;
const frames = [
  { time: 0, sample_seconds: 2, people: [{id:'A',bbox:[.4,.3,.2,.2]}] },
  { time: 2, sample_seconds: 1, people: [{id:'A',bbox:[.4,.3,.2,.2]}] },
];
const heat = buildFloorHeatmap(frames, {calibration:identity,width:32,height:32,startTime:.5,endTime:2.5});
near(heat.mappedPersonSeconds,2); near(heat.grid.reduce((a,b)=>a+b,0),2); near(heat.observedPersonSeconds,2); checks++;
const half = buildFloorHeatmap([{time:0,sample_seconds:.5,people:[{id:'A',bbox:[.4,.3,.2,.2]}]}],{calibration:identity,width:32,height:32});
const twice = buildFloorHeatmap([{time:0,sample_seconds:2,people:[{id:'A',bbox:[.4,.3,.2,.2]}]}],{calibration:identity,width:32,height:32});
near(twice.max,half.max*4); checks++;
const excluded = buildFloorHeatmap([{time:0,sample_seconds:2,people:[{id:'A',bbox:[.1,.8,.2,.2]},{id:'B',bbox:[.9,.2,.2,.2]}]}],{calibration:identity});
near(excluded.observedPersonSeconds,4); near(excluded.excludedPersonSeconds,4); near(excluded.mappedPersonSeconds,0); assert.equal(excluded.max,0); checks++;
const boundary = buildFloorHeatmap([{time:0,sample_seconds:2,people:[{id:'A',bbox:[0,0,.001,.001]}]}],{calibration:identity});
near(boundary.grid.reduce((a,b)=>a+b,0),2); checks++;
const empty = buildFloorHeatmap([],{calibration:identity}); assert.equal(empty.max,0); assert.equal(empty.acceptedObservations,0); checks++;
const largestEmpty = buildFloorHeatmap([],{calibration:identity,width:512,height:512});
assert.equal(largestEmpty.grid.length,512*512); assert.equal(largestEmpty.max,0); checks++;
assert.throws(()=>solveHomography({...identity,imagePoints:[[0,0],[0,0],[0,0],[0,0]]})); checks++;
console.log(`Floor projection tests passed: ${checks} cases (corners, duration, mass conservation, exclusion, empty, degeneracy).`);
