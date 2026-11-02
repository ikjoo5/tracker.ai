import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArrowDownToLine, Layers3, Move3D, RotateCcw, ScanLine, Eye, Info, LoaderCircle } from 'lucide-react';
import { buildFloorHeatmap, DEFAULT_FLOOR_CALIBRATION } from './floorProjection';
import './floorHeatmap.css';

type FloorResult = {
  id: string;
  source: { name: string; kind: string; duration: number; provenance?: { creator: string; source_url: string; license: string; license_url: string } };
  frames: { time: number; sample_seconds?: number; people: { id: string | number; bbox: number[] }[] }[];
};
type ViewApi = { reset: () => void; top: () => void; iso: () => void; exportImage: () => string; shelves: (visible: boolean) => void };
type DensityMap = ReturnType<typeof buildFloorHeatmap>;
const PALETTE = [
  { at: 0, rgb: [49, 82, 211] }, { at: .24, rgb: [23, 163, 224] },
  { at: .46, rgb: [69, 209, 171] }, { at: .66, rgb: [247, 226, 66] },
  { at: .83, rgb: [252, 143, 39] }, { at: 1, rgb: [225, 57, 43] },
];
const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');

function heatCanvas(data: DensityMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(data.width, data.height);
  for (let i = 0; i < data.grid.length; i++) {
    const relative = data.max > 0 ? data.grid[i] / data.max : 0;
    if (relative < .007) continue;
    const level = Math.pow(relative, .52);
    const upper = PALETTE.findIndex(stop => stop.at >= level);
    const a = PALETTE[Math.max(0, upper - 1)], b = PALETTE[Math.max(0, upper)];
    const factor = b.at > a.at ? (level - a.at) / (b.at - a.at) : 0;
    for (let channel = 0; channel < 3; channel++) pixels.data[i * 4 + channel] = Math.round(a.rgb[channel] + (b.rgb[channel] - a.rgb[channel]) * factor);
    pixels.data[i * 4 + 3] = Math.round(Math.min(1, relative * 22) * 225);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function makeScene(host: HTMLDivElement, data: DensityMap): { api: ViewApi; dispose: () => void } {
  const width = Math.max(1, host.clientWidth), height = Math.max(420, host.clientHeight);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f2f2e9');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#f2f2e9');
  renderer.domElement.dataset.testid = 'floor-heatmap-canvas';
  renderer.domElement.setAttribute('aria-label', '3D store heatmap projected from real video observations');
  host.appendChild(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-7.6 * width / height, 7.6 * width / height, 7.6, -7.6, .1, 100);
  camera.position.set(10, 11, 13); camera.zoom = 1; camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, .15, 0);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.minZoom = .25; controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * .465; controls.minPolarAngle = .03; controls.enablePan = true;
  controls.update();
  scene.add(new THREE.AmbientLight('#ffffff', 1.1));
  const sun = new THREE.DirectionalLight('#fff8e4', 2.2); sun.position.set(-4, 12, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.normalBias = .035; sun.shadow.bias = -.0003; sun.shadow.radius = 4; scene.add(sun);
  const rim = new THREE.DirectionalLight('#dde8f3', .7); rim.position.set(6, 4, -7); scene.add(rim);
  const boxes: THREE.Mesh[] = [];
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, group: THREE.Group | THREE.Scene = scene, roughness = .8) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness, metalness: .02 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); boxes.push(mesh); return mesh;
  }
  // A schematic floor has visual units, not surveyed metres.
  box(0, -.31, 0, 6.8, .4, 8.8, '#cbd1c8');
  box(0, -.08, 0, 6.5, .12, 8.5, '#fbfaf4');
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#f2f2e9', toneMapped: false }));
  surround.rotation.x = -Math.PI / 2; surround.position.y = -.52; surround.receiveShadow = true; scene.add(surround);
  const grid = new THREE.GridHelper(8, 20, '#dbe0d5', '#e6e9e0'); grid.position.y = -.012; grid.scale.x = .79; grid.material.opacity = .55; grid.material.transparent = true; scene.add(grid);
  const heatTexture = new THREE.CanvasTexture(heatCanvas(data)); heatTexture.colorSpace = THREE.SRGBColorSpace;
  heatTexture.minFilter = THREE.LinearFilter; heatTexture.magFilter = THREE.LinearFilter;
  const heat = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), new THREE.MeshBasicMaterial({ map: heatTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  heat.rotation.x = -Math.PI / 2; heat.position.y = .014; scene.add(heat);
  const shelves = new THREE.Group(); scene.add(shelves);
  // Reconstructed left / middle / right display rows, based on the visible video.
  function shelf(x: number, z: number, span: number, levels: number, side: 'left' | 'right' | 'centre') {
    const island = side === 'centre'; const shelfWidth = island ? 1.12 : .70; const totalHeight = island ? .66 : 1.24;
    box(x, totalHeight / 2 + .04, z, shelfWidth, totalHeight, span, island ? '#d3cbbb' : '#c7cec5', shelves);
    for (let level = 0; level < levels; level++) {
      const y = .15 + (level + 1) * totalHeight / levels;
      box(x, y, z, shelfWidth + .1, .055, span + .08, '#e6e8df', shelves);
      const items = Math.floor(span / .38);
      for (let row = 0; row < items; row++) {
        const pz = z - span / 2 + .24 + row * .38;
        const tone = ['#d2d4c6', '#f0e8d5', '#d5dfdb', '#e2c9b4', '#e1e4dc'][(row + level * 2) % 5];
        if ((row + level) % 3 === 0) {
          const product = new THREE.Mesh(new THREE.CylinderGeometry(.12, .105, .14, 14), new THREE.MeshStandardMaterial({ color: tone, roughness: .72 }));
          product.position.set(x + (island ? -.23 : 0), y + .1, pz); product.castShadow = true; shelves.add(product);
          if (island) {
            const stack = product.clone(); stack.position.x = x + .24; stack.position.y += .025; shelves.add(stack);
          }
        } else box(x + (island ? (row % 2 ? .23 : -.23) : 0), y + .115, pz, .22, .18, .24, tone, shelves);
      }
    }
    for (const end of [-1, 1]) box(x, totalHeight / 2 + .05, z + end * (span / 2 + .03), shelfWidth + .1, totalHeight + .1, .055, '#dce1d7', shelves);
  }
  shelf(-2.72, -.25, 6.7, 3, 'left'); shelf(2.72, -.25, 6.7, 3, 'right'); shelf(0, .35, 4.5, 1, 'centre');
  // Short rear shelving and an understated entry threshold anchor the orientation.
  box(0, .47, -3.72, 4.65, .86, .30, '#e2e5d9', shelves);
  for (let x = -1.95; x <= 2; x += .3) box(x, .95, -3.72, .17, .16, .17, '#cbd6ca', shelves);
  box(0, .022, 4.05, 1.4, .018, .17, '#b3c1aa');
  // A soft shadow underneath the floating base adds depth without fake heat.
  function label(value: string, x: number, z: number, scale = 1) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d')!; context.font = '500 35px "Noto Sans", sans-serif'; context.fillStyle = '#687363'; context.textAlign = 'center'; context.fillText(value, 256, 61);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })); sprite.position.set(x, .05, z); sprite.scale.set(2.5 * scale, .47 * scale, 1); scene.add(sprite);
  }
  label('LEFT DISPLAY', -2.1, 4.65, .72); label('RIGHT DISPLAY', 2.1, 4.65, .72); label('ENTRY / NEAR', 0, 5.0, .73); label('FAR / REAR', 0, -4.7, .72);
  const fitCamera = () => {
    // Fit only the store and its labels; the infinite backdrop must not affect fit.
    camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    let extentX = 0, extentY = 0;
    for (const x of [-3.7, 3.7]) for (const y of [-.5, 1.55]) for (const z of [-5.0, 5.2]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      extentX = Math.max(extentX, Math.abs(point.x)); extentY = Math.max(extentY, Math.abs(point.y));
    }
    camera.zoom = Math.max(.25, Math.min(3, .88 / extentX, .84 / extentY));
    camera.updateProjectionMatrix();
  };
  controls.update(); fitCamera();
  let disposed = false, animation = 0;
  const draw = () => { if (disposed) return; controls.update(); renderer.render(scene, camera); animation = requestAnimationFrame(draw); }; draw();
  const resize = new ResizeObserver(() => {
    const w = Math.max(1, host.clientWidth), h = Math.max(350, host.clientHeight);
    renderer.setSize(w, h); camera.left = -7.6 * w / h; camera.right = 7.6 * w / h; camera.updateProjectionMatrix(); fitCamera();
  }); resize.observe(host);
  const setIso = () => { camera.position.set(10, 11, 13); controls.target.set(0, .15, 0); camera.zoom = 1; camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); controls.update(); fitCamera(); renderer.render(scene, camera); };
  return {
    api: {
      reset: setIso, iso: setIso,
      top: () => { camera.position.set(0, 18, .001); controls.target.set(0, 0, 0); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); fitCamera(); renderer.render(scene, camera); },
      shelves: (visible: boolean) => { shelves.visible = visible; renderer.render(scene, camera); },
      exportImage: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    },
    dispose: () => {
      disposed = true; cancelAnimationFrame(animation); resize.disconnect(); controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) { if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose(); }
        }
      });
      heatTexture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}

function fallbackScene(host: HTMLDivElement, data: DensityMap): { api: ViewApi; dispose: () => void } {
  const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
  canvas.dataset.testid = 'floor-heatmap-canvas'; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.objectFit = 'contain'; host.appendChild(canvas);
  const context = canvas.getContext('2d')!; let showShelves = true;
  const point = (x: number, z: number, h = 0) => [800 + (x - z) * 82, 480 + (x + z) * 36 - h * 100];
  function polygon(points: number[][], fill: string, stroke = '#d1d7cd') { context.beginPath(); points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
  function cube(x: number, z: number, w: number, d: number, h: number) {
    const a = point(x-w/2, z-d/2), b = point(x+w/2, z-d/2), c = point(x+w/2, z+d/2), e = point(x-w/2, z+d/2);
    const at = point(x-w/2,z-d/2,h), bt=point(x+w/2,z-d/2,h), ct=point(x+w/2,z+d/2,h), et=point(x-w/2,z+d/2,h);
    polygon([e,c,ct,et], '#c8cfc3'); polygon([c,b,bt,ct], '#dce1d6'); polygon([at,bt,ct,et], '#faf9f1');
    return a;
  }
  const draw = () => {
    context.fillStyle = '#f2f2e9'; context.fillRect(0,0,1600,1000);
    polygon([point(-3.4,-4.4),point(3.4,-4.4),point(3.4,4.4),point(-3.4,4.4)], '#fafaf5');
    const image=heatCanvas(data);const origin=point(-3,-4);
    context.save(); context.transform(6*82/data.width,6*36/data.width,-8*82/data.height,8*36/data.height,origin[0],origin[1]);context.drawImage(image,0,0);context.restore();
    if(showShelves) { cube(-2.72, -.25, .7,6.7,1);cube(2.72,-.25,.7,6.7,1);cube(0,.35,1.12,4.5,.6); }
    context.fillStyle='#687363';context.font='20px sans-serif';context.fillText('ISOMETRIC VIEW · WebGL unavailable',48,950);
  };draw();
  return {api:{reset:draw,top:draw,iso:draw,shelves:(visible)=>{showShelves=visible;draw();},exportImage:()=>canvas.toDataURL('image/png')},dispose:()=>canvas.remove()};
}

export default function FloorHeatmap({ result }: { result: FloorResult | null }) {
  const hostRef = useRef<HTMLDivElement>(null); const apiRef = useRef<ViewApi | null>(null);
  const [range, setRange] = useState('all'); const [shelves, setShelves] = useState(true); const [top, setTop] = useState(false); const [fallback, setFallback] = useState(false); const [saving, setSaving] = useState(false);
  const duration = result?.source.duration || 0;
  const start = range === 'last' ? duration / 2 : 0, end = range === 'first' ? duration / 2 : duration;
  const sourceUrl = result?.source.provenance?.source_url || '';
  const supported = result?.source.kind === 'public-retail' && sourceUrl.includes('intel-iot-devkit/sample-videos/') && sourceUrl.endsWith('/store-aisle-detection.mp4');
  const data = useMemo(() => buildFloorHeatmap(supported ? result?.frames || [] : [], { startTime: start, endTime: end, calibration: DEFAULT_FLOOR_CALIBRATION, width: 128, height: 160, sigma: .04 }), [result, start, end, supported]);
  useEffect(() => {
    const host = hostRef.current; if (!host || !result || !supported) return;
    let instance: { api: ViewApi; dispose: () => void };
    try { instance = makeScene(host, data); setFallback(false); }
    catch { host.replaceChildren(); instance = fallbackScene(host, data); setFallback(true); }
    apiRef.current = instance.api; instance.api.shelves(shelves); if (top) instance.api.top();
    return () => { apiRef.current = null; instance.dispose(); };
    // Camera toggles modify the existing scene; only new data rebuilds geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, supported, data]);
  useEffect(() => { apiRef.current?.shelves(shelves); }, [shelves]);
  useEffect(() => { if (top) apiRef.current?.top(); else apiRef.current?.iso(); }, [top]);
  async function savePng() {
    if (!apiRef.current || !result) return; setSaving(true);
    try {
      const source = new Image(); source.src = apiRef.current.exportImage(); await source.decode();
      const canvas = document.createElement('canvas'); canvas.width = 2200; canvas.height = 1740;
      const context = canvas.getContext('2d')!; context.fillStyle = '#fafbf6'; context.fillRect(0,0,2200,1740);
      context.fillStyle = '#e88e59'; context.font = '700 26px sans-serif'; context.fillText('TRACKER.AI  /  SPATIAL DWELL',90,77);
      context.fillStyle='#28352e';context.font='700 58px "Noto Sans",sans-serif';context.fillText('Real-store 3D dwell heatmap',90,164);
      context.fillStyle='#657164';context.font='26px "Noto Sans",sans-serif';context.fillText(`${start.toFixed(0)}–${end.toFixed(0)}s observed  ·  ${data.acceptedObservations} floor projections  ·  ${fmt(data.mappedPersonSeconds)} person-s`,92,218);
      const frameX=65,frameY=255,frameW=2070,frameH=1160;
      const scale=Math.min(frameW/source.width,frameH/source.height);const dw=source.width*scale,dh=source.height*scale;
      context.fillStyle='#f2f2e9';context.fillRect(frameX,frameY,frameW,frameH);context.drawImage(source,frameX+(frameW-dw)/2,frameY+(frameH-dh)/2,dw,dh);
      const gradient=context.createLinearGradient(90,0,690,0);PALETTE.forEach(stop=>gradient.addColorStop(stop.at,`rgb(${stop.rgb.join(',')})`));context.fillStyle=gradient;context.fillRect(90,1460,600,22);
      context.fillStyle='#475442';context.font='24px "Noto Sans",sans-serif';context.fillText('Lower relative dwell',90,1521);context.textAlign='right';context.fillText('Higher relative dwell',690,1521);context.textAlign='left';
      context.font='24px "Noto Sans",sans-serif';context.fillText('Manual perspective calibration · Reconstructed layout · Not a surveyed plan',780,1482);
      context.fillStyle='#677061';context.font='22px "Noto Sans",sans-serif';context.fillText(`Estimated footpoints; uncertain/out-of-floor observations excluded: ${data.totalObservations-data.acceptedObservations} / ${fmt(data.excludedPersonSeconds)} person-s.`,780,1522);
      context.fillStyle='#7a8376';context.font='21px sans-serif';
      context.fillText(`Source video: ${result.source.provenance?.creator || result.source.name} | ${result.source.provenance?.license || 'Local observations'} | Modified visualization`,90,1602);
      context.font='18px sans-serif';context.fillText(result.source.provenance?.source_url || result.source.name,90,1644);
      context.fillText(`License: ${result.source.provenance?.license_url || 'Local source'}   ·   No individual identity or purchase intent inferred.`,90,1681);
      const anchor=document.createElement('a');anchor.href=canvas.toDataURL('image/png');anchor.download='tracker-ai-3d-dwell-heatmap.png';anchor.click();
    } finally { setSaving(false); }
  }
  const excluded = data.totalObservations - data.acceptedObservations;
  if (!result) return <section className="floor-panel floor-loading"><LoaderCircle className="spin" size={30}/><strong>Preparing a 3D map from store observations</strong><p>The map appears after person positions and observation time are collected.</p></section>;
  if (!supported) return <section className="floor-panel floor-unsupported"><Move3D size={34}/><h2>This video needs floor calibration.</h2><p>This 3D layout is manually configured for the public housewares-store clip. Reusing the calibration for a different camera would place observations incorrectly.</p><p>Select the public retail sample to explore the 3D map. Detections and raw observations for this video remain available in the video and data views.</p></section>;
  return <section className="floor-panel" aria-label="3D store dwell heatmap">
    <header className="floor-header"><div><span className="floor-kicker">FROM OBSERVATION TO SPACE</span><h2>Dwell time, mapped into space<span>3D VIEW</span></h2><p>Relative dwell from estimated foot positions and observed time</p></div><button className="floor-export" onClick={()=>void savePng()} disabled={saving} aria-label="Save 3D heatmap PNG">{saving?<LoaderCircle size={16} className="spin"/>:<ArrowDownToLine size={16}/>} Save PNG image</button></header>
    <div className="floor-toolbar"><div className="floor-preset"><span className="floor-live-dot"/> Public housewares store <small>Manual calibration</small></div><div className="floor-controls"><label>Time range<select aria-label="3D observation interval" value={range} onChange={event=>setRange(event.target.value)}><option value="all">All {duration.toFixed(0)}s</option><option value="first">First {Math.floor(duration/2)}s</option><option value="last">Last {Math.ceil(duration/2)}s</option></select></label><button aria-label="Show shelves" aria-pressed={shelves} className={shelves?'active':''} onClick={()=>setShelves(!shelves)}><Layers3 size={15}/><span>Shelves</span></button><button aria-label="Top view" disabled={fallback} aria-pressed={top} className={top?'active':''} onClick={()=>setTop(!top)}><ScanLine size={15}/><span>Top view</span></button><button aria-label="Reset view" onClick={()=>{setTop(false);apiRef.current?.reset();}}><RotateCcw size={15}/><span>Reset</span></button></div></div>
    <div className="floor-stage"><div className="floor-canvas" ref={hostRef}/><div className="floor-stage-badge"><i/> ACTUAL VIDEO OBSERVATIONS <span>{duration.toFixed(0)}s / INTEL</span></div><div className="floor-floor-label"><span>MANUALLY RECONSTRUCTED</span><strong>Dwell patterns between displays</strong><small>Illustrative layout, not a surveyed plan.</small></div><div className="floor-orbit-hint"><Move3D size={15}/>{fallback?'Compatibility mode · Fixed isometric view':'Drag to orbit · Scroll to zoom'}</div><div className="floor-stage-compass"><span>FAR</span><i>↑</i><small>NEAR</small></div></div>
    <div className="floor-legend-row"><div className="floor-heat-legend"><span>Low</span><i/><span>High</span><strong>Relative dwell density</strong></div><span className="floor-empty-key"><i/> No observation / Low density</span><span className="floor-unit-note">Not temperature or measured crowd density</span></div>
    <div className="floor-observation-stats"><div><span>Projected observations</span><strong>{data.acceptedObservations}<small> / {data.totalObservations} records</small></strong></div><div><span>Mapped observation time</span><strong>{fmt(data.mappedPersonSeconds)}<small> person-s</small></strong></div><div><span>Uncertain feet / Outside floor</span><strong>{excluded}<small> records · {fmt(data.excludedPersonSeconds)} person-s</small></strong></div><div className="floor-method-tag"><Eye size={17}/><p>Recorded observations<strong>Relative color from accumulated observation time</strong></p></div></div>
    <div className="floor-caveat"><Info size={17}/><p><strong>Manual calibration · Reconstructed layout · Not surveyed</strong>BBox bottom centers estimate foot positions. Observations with clipped feet or positions outside the calibrated floor are excluded. Shelf shapes and spacing are illustrative and do not establish real-world distances or path accuracy.</p></div>
  </section>;
}
