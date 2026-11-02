/**
 * Observation-weighted floor projection, not an automatic 3D reconstruction.
 * The default four image corners are a manually estimated floor envelope for
 * the attributed Intel housewares clip. They are not surveyed coordinates.
 */
export type Point2 = [number, number];
export type FloorCalibration = {
  name: string;
  imagePoints: Point2[];
  floorPoints: Point2[];
  approximate: boolean;
  note?: string;
};
export type FloorFrame = {
  time: number;
  sample_seconds?: number;
  people: { id: string | number; bbox: number[] }[];
};
export type FloorHeatPoint = { u: number; v: number; seconds: number; time: number; trackId: string | number };
export type FloorHeatmapOptions = {
  calibration: FloorCalibration;
  startTime?: number;
  endTime?: number;
  width?: number;
  height?: number;
  sigma?: number;
  /** Truncated detection bottoms cannot establish where a person's feet are. */
  excludeClippedFeet?: boolean;
};
export type FloorHeatmap = {
  grid: number[];
  width: number;
  height: number;
  max: number;
  observedPersonSeconds: number;
  mappedPersonSeconds: number;
  excludedPersonSeconds: number;
  acceptedObservations: number;
  totalObservations: number;
  clippedFootObservations: number;
  outsideFloorObservations: number;
  points: FloorHeatPoint[];
  calibration: FloorCalibration;
};

export const DEFAULT_FLOOR_CALIBRATION: FloorCalibration = {
  name: 'Intel 공개 매장 · 수동 원근 보정 예시',
  imagePoints: [[.28, .24], [.61, .24], [.90, 1], [0, 1]],
  floorPoints: [[0, 0], [1, 0], [1, 1], [0, 1]],
  approximate: true,
  note: '빈 매장 프레임의 바닥 외곽을 수동 추정했습니다. 매대 크기·통로 폭은 실측값이 아니며 자동 3D 복원이 아닙니다.',
};

/** Solve H with h33=1. Throws for degenerate or non-finite calibration. */
export function solveHomography(calibration: FloorCalibration): number[] {
  const { imagePoints, floorPoints } = calibration;
  if (imagePoints.length !== 4 || floorPoints.length !== 4 ||
      [...imagePoints, ...floorPoints].some(p => p.length !== 2 || p.some(n => !Number.isFinite(n)))) {
    throw new Error('보정에는 유한한 좌표 네 쌍이 필요합니다.');
  }
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = imagePoints[i], [u, v] = floorPoints[i];
    a.push([x, y, 1, 0, 0, 0, -u*x, -u*y, u]);
    a.push([0, 0, 0, x, y, 1, -v*x, -v*y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col+1; row < 8; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) throw new Error('보정점이 일직선이거나 겹쳐 원근 변환을 계산할 수 없습니다.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 9; j++) a[col][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j < 9; j++) a[row][j] -= factor*a[col][j];
    }
  }
  return [...a.map(row => row[8]), 1];
}

function transform(point: Point2, h: number[]): Point2 | null {
  if (!point.every(Number.isFinite)) return null;
  const [x, y] = point;
  const divisor = h[6]*x + h[7]*y + h[8];
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-10) return null;
  const u = (h[0]*x+h[1]*y+h[2])/divisor;
  const v = (h[3]*x+h[4]*y+h[5])/divisor;
  // Reject observations outside the floor. Only floating-point corner error
  // within 1e-9 is snapped; distant observations never accumulate at an edge.
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < -1e-9 || v < -1e-9 || u > 1+1e-9 || v > 1+1e-9) return null;
  return [u < 0 ? 0 : u > 1 ? 1 : u, v < 0 ? 0 : v > 1 ? 1 : v];
}

export function projectObservation(point: Point2, calibration: FloorCalibration): Point2 | null {
  return transform(point, solveHomography(calibration));
}

/** Bottom-center is an estimated image footpoint, never a person's identity. */
export function footpointOf(bbox: number[]): Point2 | null {
  if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n))) return null;
  const [x, y, w, h] = bbox;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x+w > 1.00001 || y+h > 1.00001) return null;
  return [x+w/2, y+h];
}

/**
 * Sum actual sample_seconds, clipped to the selected time interval. Gaussian
 * footprints conserve the mapped person-seconds even at a floor boundary.
 * Rendering may normalize grid/max for a relative legend; raw grid stays in
 * observed person-seconds per grid cell and is not measured physical density.
 */
export function buildFloorHeatmap(frames: FloorFrame[], options: FloorHeatmapOptions): FloorHeatmap {
  const { calibration } = options;
  const width = options.width ?? 96, height = options.height ?? 128, sigma = options.sigma ?? .035;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 512 || height > 512 || !Number.isFinite(sigma) || sigma <= 0 || sigma > 1) {
    throw new Error('히트맵 격자와 평활화 크기가 올바르지 않습니다.');
  }
  const start = options.startTime ?? 0, end = options.endTime ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || Number.isNaN(end) || end < start) throw new Error('관찰 시간 구간이 올바르지 않습니다.');
  const h = solveHomography(calibration), grid = new Array<number>(width*height).fill(0);
  const result: FloorHeatmap = { grid, width, height, max: 0, observedPersonSeconds: 0, mappedPersonSeconds: 0,
    excludedPersonSeconds: 0, acceptedObservations: 0, totalObservations: 0, clippedFootObservations: 0,
    outsideFloorObservations: 0, points: [], calibration };
  const sorted = [...frames].sort((a, b) => a.time-b.time);
  for (let index = 0; index < sorted.length; index++) {
    const frame = sorted[index];
    if (!Number.isFinite(frame.time)) continue;
    // Recorded duration has priority. Without it, use a known next timestamp;
    // never invent 1/3 second for a missing terminal sample.
    const duration = frame.sample_seconds ?? (index+1 < sorted.length ? sorted[index+1].time-frame.time : Number.isFinite(end) ? end-frame.time : 0);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const seconds = Math.max(0, Math.min(frame.time+duration, end)-Math.max(frame.time, start));
    if (seconds <= 0) continue;
    for (const person of frame.people) {
      result.totalObservations++;
      result.observedPersonSeconds += seconds;
      const foot = footpointOf(person.bbox);
      if (foot && (options.excludeClippedFeet ?? true) && foot[1] >= .995) {
        result.clippedFootObservations++;
        result.excludedPersonSeconds += seconds;
        continue;
      }
      const mapped = foot ? transform(foot, h) : null;
      if (!mapped) {
        result.outsideFloorObservations++;
        result.excludedPersonSeconds += seconds;
        continue;
      }
      const [u, v] = mapped;
      result.acceptedObservations++;
      result.mappedPersonSeconds += seconds;
      result.points.push({ u, v, seconds, time: frame.time, trackId: person.id });
      const centerX = u*(width-1), centerY = v*(height-1);
      const radiusX = Math.ceil(sigma*width*3), radiusY = Math.ceil(sigma*height*3);
      const x0 = Math.max(0, Math.floor(centerX-radiusX)), x1 = Math.min(width-1, Math.ceil(centerX+radiusX));
      const y0 = Math.max(0, Math.floor(centerY-radiusY)), y1 = Math.min(height-1, Math.ceil(centerY+radiusY));
      let totalWeight = 0;
      const cells: [number, number][] = [];
      for (let row = y0; row <= y1; row++) for (let col = x0; col <= x1; col++) {
        const dx = (col/(width-1)-u)/sigma, dy = (row/(height-1)-v)/sigma;
        const weight = Math.exp(-.5*(dx*dx+dy*dy));
        totalWeight += weight;
        cells.push([row*width+col, weight]);
      }
      for (const [cell, weight] of cells) grid[cell] += seconds*weight/totalWeight;
    }
  }
  result.max = grid.reduce((maximum, value) => Math.max(maximum, value), 0);
  return result;
}
