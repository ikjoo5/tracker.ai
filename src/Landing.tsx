import { useEffect, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Braces, Check, ChevronRight, CircleDot, Code2, Database, FileJson, Focus, Github, Layers3, Menu, Move3D, Play, ScanLine, ShieldCheck, Store, Video, X } from 'lucide-react';
import './landing.css';

const REPOSITORY = 'https://github.com/ikjoo5/cafe.ai';
const asset = (name: string) => `${import.meta.env.BASE_URL}showcase/${name}`;
const source = 'https://github.com/intel-iot-devkit/sample-videos/blob/57978890822836f2b4743852f04f62fc511757e4/store-aisle-detection.mp4';
const steps = [
  { icon: Video, name: 'Video input', en: 'INPUT', detail: 'Start with a fixed camera.', body: 'The demo uses a 52-second excerpt from a public housewares-store video. Define the observation zones and preserve the source, duration, and resolution.', tag: 'CCTV / MP4', output: 'Video · Source metadata' },
  { icon: Focus, name: 'Person detection', en: 'DETECTION', detail: 'Find people in each sampled frame.', body: 'A pretrained MobileNet-SSD model detects the person class at approximately 3 fps. Each observation records a bounding box and detection score. Occlusion can cause missed detections.', tag: 'MobileNet-SSD', output: 'BBox · Detection score · Timestamp' },
  { icon: ScanLine, name: 'Temporary tracking', en: 'TRACKING', detail: 'Connect observations into short paths.', body: 'Nearby observation centers are linked with temporary IDs that exist only within the clip. No face or identity recognition is used. Occlusion and crossing paths can fragment IDs.', tag: 'Temporary tracks', output: 'Temporary ID · Position history' },
  { icon: Database, name: 'Observation storage', en: 'COLLECTION', detail: 'Turn every observation into a record.', body: 'Store the timestamp, frame number, track ID, normalized and pixel coordinates, zone, and observed interval in CSV and JSON. Keep the evidence behind the visualization.', tag: 'CSV + JSON', output: 'Traceable observation records' },
  { icon: Move3D, name: 'Floor projection', en: 'PROJECTION', detail: 'Move image positions onto a floor plane.', body: 'Estimate foot positions from bounding-box bottom centers and project them through a manually calibrated perspective transform. Clipped feet and out-of-bounds observations are excluded. These are not surveyed coordinates.', tag: 'Manual calibration', output: 'Floor coordinates · Inclusion records' },
  { icon: Layers3, name: 'Dwell visualization', en: 'VISUALIZATION', detail: 'See accumulated time as a spatial map.', body: 'Accumulate observed time at projected positions and apply Gaussian smoothing. Shelves form an illustrative 3D reconstruction. Colors show relative observed dwell within the selected interval.', tag: '3D dwell map', output: '3D dwell map · PNG' },
];

type Observation = { time_seconds: number; track_id: string; bbox: number[]; confidence: number; zone: string; sample_seconds: number };
const verifiedRows: Observation[] = [
  { time_seconds: 1.333, track_id: 'T001', bbox: [.66072, .4809, .32273, .5191], confidence: .95422, zone: 'household', sample_seconds: .334 },
  { time_seconds: 1.667, track_id: 'T001', bbox: [.64199, .44066, .29542, .55568], confidence: .8775, zone: 'household', sample_seconds: .333 },
  { time_seconds: 2, track_id: 'T001', bbox: [.64518, .42209, .2458, .5699], confidence: .97772, zone: 'household', sample_seconds: .333 },
];

function SectionLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return <div className="lp-section-label"><span>{number}</span>{children}</div>;
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState(0);
  const [spatialView, setSpatialView] = useState<'concept' | 'actual'>('concept');
  const [cameraView, setCameraView] = useState<'raw' | 'observed'>('observed');
  const [records, setRecords] = useState(verifiedRows);
  useEffect(() => {
    let live = true;
    fetch(asset('observation-preview.json')).then(r => r.ok ? r.json() : null).then(data => {
      if (live && Array.isArray(data?.records) && data.records.length && data.records[0].bbox?.length === 4) setRecords(data.records.slice(0, 3));
    }).catch(() => { /* verified rows remain available in an offline copy */ });
    return () => { live = false; };
  }, []);
  const step = steps[selectedStep];
  return <div className="landing-page">
    <a href="#main-content" className="lp-skip">Skip to content</a>
    <div className="lp-dark-shell">
      <header className="lp-header">
        <a className="lp-brand" href="#" aria-label="tracker.ai home"><Store size={25}/><span>tracker<span className="lp-brand-dot">.</span>ai</span><small>SPATIAL INTELLIGENCE</small></a>
        <nav className={`lp-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Project navigation">
          {[['#solution', 'Solution'], ['#pipeline', 'Pipeline'], ['#data', 'Data'], ['#demo', 'Demo']].map(([href, label]) => <a href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a href={REPOSITORY} target="_blank" rel="noopener noreferrer" className="lp-nav-github"><Github size={16}/> GitHub <ArrowUpRight size={14}/></a>
        </nav>
        <button className="lp-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23}/> : <Menu size={23}/>}</button>
      </header>
      <main id="main-content">
        <section className="lp-hero lp-wrap" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow"><span/> CCTV → SPATIAL DATA <i>PROJECT / 001</i></div>
            <h1 id="hero-title">Turn movement<br/><em>into spatial insight.</em></h1>
            <p className="lp-hero-description">Connect moments captured on camera.<br/>See where people pause and move.</p>
            <p className="lp-hero-sub">From person detection to observation records and 3D dwell maps.<br/>A retail-observation pipeline that starts with existing footage.</p>
            <div className="lp-hero-actions"><a className="lp-button lp-button-coral" href="#demo"><Play size={16} fill="currentColor"/> Watch the demo <ArrowUpRight size={17}/></a><a className="lp-text-link lp-light-link" href={REPOSITORY} target="_blank" rel="noopener noreferrer"><Github size={17}/> View source code <ArrowRight size={16}/></a></div>
            <div className="lp-hero-status"><span/><strong>Prototype using real public footage</strong><i/>Temporary IDs. No facial recognition.</div>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-visual-meta"><span><Box size={13}/> A NEW WAY TO SEE YOUR STORE</span><span>3D / DWELL</span></div>
            <img src={asset('hero-heatmap.png')} alt="Illustrative 3D store concept with color-coded dwell patterns. Not measured data." fetchPriority="high"/>
            <div className="lp-visual-caption"><span className="lp-concept-pill">CONCEPT VIEW</span><p>Illustrative store concept<br/><strong>Not measured data.</strong></p><div className="lp-mini-legend"><i/><span>Relative dwell</span></div></div>
            <div className="lp-hero-float"><CircleDot size={18}/><div><strong>From motion to meaning.</strong><span>Movement, in spatial context.</span></div></div>
          </div>
        </section>
        <div className="lp-proof-strip lp-wrap"><div className="lp-proof-intro"><span>THE REAL DEMO</span><p>Even a short clip<br/><strong>can leave a traceable record.</strong></p></div><div><strong>52<small>s</small></strong><span>Real store footage</span></div><div><strong>156</strong><span>Sampled frames</span></div><div><strong>372</strong><span>Person observations</span></div><div className="lp-proof-foot"><span>Intel public housewares-store video</span><small>CC BY 4.0 · Pretrained detector</small></div></div>
      </main>
    </div>

    <section id="solution" className="lp-section lp-wrap lp-solution" aria-labelledby="solution-title">
      <SectionLabel number="01">SEE THE UNSEEN</SectionLabel>
      <div className="lp-section-heading"><h2 id="solution-title">Cameras record.<br/>We keep <em>observable evidence.</em></h2><p>Start with the camera already in the store.<br/>Collect where people are observed and for how long,<br/>using a process that can be inspected and reproduced.</p></div>
      <div className="lp-observation-grid lp-complex-grid">
        <figure className="lp-camera-card lp-complex-camera"><div className="lp-camera-chrome"><span><ScanLine size={13}/> COMPLEX STORE / SCENARIO</span><span>ILLUSTRATIVE</span></div><img src={asset('bbox-complex.png')} alt="Generated illustration of a crowded store with person bounding boxes. An illustrative scenario, not model inference." loading="lazy"/><figcaption><div><span className="lp-concept-pill">Generated illustration</span><strong>One pipeline, a more complex scene</strong><p>Complex-store scenario · Generated illustration · Not model inference</p></div></figcaption></figure>
        <figure className="lp-camera-card lp-camera-detection"><div className="lp-camera-chrome"><span><Focus size={12}/> ACTUAL PUBLIC VIDEO</span><div className="lp-camera-switch" role="group" aria-label="Compare source footage and model output"><button aria-pressed={cameraView === 'raw'} onClick={() => setCameraView('raw')}>Raw</button><button aria-pressed={cameraView === 'observed'} onClick={() => setCameraView('observed')}>Model output</button></div></div><img src={asset(cameraView === 'raw' ? 'retail-frame.jpg' : 'retail-bbox.jpg')} alt={cameraView === 'raw' ? 'Source frame from an Intel public video of a real housewares store' : 'Person bounding boxes and temporary track IDs produced by MobileNet-SSD on real public store footage'} loading="lazy"/><figcaption><div><span className="lp-measured-pill">Measured observations</span><strong>{cameraView === 'raw' ? 'A real housewares store, on camera' : 'What the current model observes'}</strong><p>Compare the source and model output at the same timestamp. Intel public footage · CC BY 4.0</p></div></figcaption></figure>
      </div>
      <div className="lp-note-row"><span><ShieldCheck size={16}/> Focused on position and time.</span><p>Occlusion can cause missed detections and fragmented IDs. Track counts are not exact visitor counts.</p></div>
    </section>

    <section id="pipeline" className="lp-pipeline-section" aria-labelledby="pipeline-title"><div className="lp-wrap">
      <SectionLabel number="02">BUILT TO BE TRACEABLE</SectionLabel>
      <div className="lp-section-heading"><h2 id="pipeline-title">From video<br/>to <em>spatial evidence.</em></h2><p>Every visual should have traceable evidence.<br/>Follow each stage from video input to visualization,<br/>with inputs and outputs that can be reviewed.</p></div>
      <div className="lp-pipeline-steps" role="tablist" aria-label="Video analysis pipeline stages">{steps.map(({ icon: Icon, name, en }, i) => <button id={`pipeline-step-${i}`} role="tab" aria-selected={selectedStep === i} aria-controls="pipeline-detail" className={selectedStep === i ? 'is-selected' : ''} key={name} onClick={() => setSelectedStep(i)}><span className="lp-step-number">0{i+1}<i/></span><span className="lp-step-icon"><Icon size={25}/></span><strong>{name}</strong><small>{en}</small>{i < steps.length - 1 && <ChevronRight className="lp-step-arrow" size={20}/>}</button>)}</div>
      <div id="pipeline-detail" className="lp-pipeline-detail" role="tabpanel" aria-labelledby={`pipeline-step-${selectedStep}`}><div className="lp-detail-number">0{selectedStep+1}<span>/ 06</span></div><div className="lp-detail-copy"><span>{step.tag}</span><h3>{step.detail}</h3><p>{step.body}</p></div><div className="lp-detail-output"><span>OUTPUT OF THIS STAGE</span><strong><Check size={16}/>{step.output}</strong></div></div>
      <div className="lp-pipeline-bottom"><p><Code2 size={17}/> Python · OpenCV · FastAPI · React · Three.js</p><a href={`${REPOSITORY}/blob/main/docs/pipeline.md`} target="_blank" rel="noopener noreferrer">Read the pipeline documentation <ArrowUpRight size={16}/></a></div>
    </div></section>

    <section id="spatial" className="lp-section lp-wrap lp-spatial" aria-labelledby="spatial-title">
      <SectionLabel number="03">TIME TAKES SHAPE</SectionLabel>
      <div className="lp-section-heading"><h2 id="spatial-title">Time spent,<br/><em>mapped into space.</em></h2><p>Warmer colors mark longer observed dwell.<br/>Explore how those observations relate<br/>to shelves, aisles, and the store layout.</p></div>
      <div className="lp-spatial-tabs" role="tablist" aria-label="3D dwell visualization examples"><button role="tab" aria-selected={spatialView === 'concept'} onClick={() => setSpatialView('concept')}>Concept store view <span>CONCEPT</span></button><button role="tab" aria-selected={spatialView === 'actual'} onClick={() => setSpatialView('actual')}>Actual observations <span>MEASURED</span></button></div>
      <figure className={`lp-spatial-figure ${spatialView === 'actual' ? 'is-actual' : ''}`}><div className="lp-spatial-image"><img src={asset(spatialView === 'concept' ? 'hero-heatmap.png' : 'dwell-3d.png')} alt={spatialView === 'concept' ? 'Illustrative 3D dwell concept for a larger store. Not measured data.' : '3D dwell map from 296 real observations projected onto a manually calibrated floor plane'} loading="lazy"/></div><figcaption><div><span className={spatialView === 'concept' ? 'lp-concept-pill' : 'lp-measured-pill'}>{spatialView === 'concept' ? 'Illustrative concept' : 'Measured observations'}</span><h3>{spatialView === 'concept' ? 'The same data flow, across a larger space.' : 'A small real example, with evidence behind it.'}</h3><p>{spatialView === 'concept' ? 'This concept illustrates how a larger store could present dwell across multiple aisles. It is separate from measured results.' : 'Of 372 observations, 296 had usable estimated foot positions. Floor calibration and shelf geometry are manually reconstructed, not surveyed.'}</p></div><a className="lp-text-link" href="#/workspace">Open the 3D workspace <ArrowUpRight size={17}/></a></figcaption></figure>
      <div className="lp-spatial-foot"><div className="lp-large-legend"><span>Lower relative dwell</span><i/><span>Higher relative dwell</span></div><p>Colors represent relative observed dwell, not temperature, purchase intent, or surveyed crowd density.</p></div>
    </section>

    <section id="data" className="lp-data-section" aria-labelledby="data-title"><div className="lp-wrap">
      <SectionLabel number="04">EVERY OBSERVATION COUNTS</SectionLabel>
      <div className="lp-section-heading"><h2 id="data-title">Frame by frame,<br/><em>a record you can compare.</em></h2><p>Preserve the position and duration of each observation.<br/>Keep those small records together<br/>and use them as evidence for the visualization.</p></div>
      <div className="lp-accumulation-frame"><div className="lp-window-bar"><div><i/><i/><i/></div><span>OBSERVATION → ACCUMULATION → SPACE</span><Database size={15}/></div><img src={asset('accumulation.png')} alt="Real store observations accumulating over 13, 26, and 52 seconds with a shared color scale" loading="lazy"/><div className="lp-accumulation-caption"><strong>One clip. A growing observation record.</strong><span>Based on actual collected observations. No invented customer counts.</span></div></div>
      <div className="lp-data-grid"><div className="lp-data-copy"><div className="lp-small-eyebrow"><Database size={15}/> OPEN OBSERVATION DATA</div><h3>Keep more than a picture.<br/>Keep the data that created it.</h3><p>Save time, tracks, coordinates, scores, zones, and observed intervals. Open the CSV in a spreadsheet or reuse the JSON for analysis and reproduction.</p><div className="lp-downloads"><a href={asset('observation-data.csv')} download><ArrowDownToLine size={16}/> Download CSV</a><a href={asset('observation-data.json')} download><FileJson size={16}/> Download JSON</a></div><small>The records below are real output samples. Detection scores are not accuracy guarantees.</small></div><div className="lp-data-table-card"><div className="lp-table-title"><span><Braces size={17}/> observations.csv</span><span>PREVIEW / 372 RECORDS</span></div><div className="lp-table-scroll"><table><thead><tr><th>time (s)</th><th>track</th><th>BBox (x, y, w, h)</th><th>score</th><th>Δt (s)</th></tr></thead><tbody>{records.map((r, i) => <tr key={`${r.track_id}-${r.time_seconds}-${i}`}><td>{r.time_seconds.toFixed(3)}</td><td><span>{r.track_id}</span></td><td>{r.bbox.map(n => n.toFixed(3)).join(', ')}</td><td>{r.confidence.toFixed(3)}</td><td>{r.sample_seconds.toFixed(3)}</td></tr>)}</tbody></table></div><div className="lp-table-bottom"><Check size={14}/> Records preserve source timestamps and observed intervals <span>CSV / JSON</span></div></div></div>
    </div></section>

    <section id="demo" className="lp-section lp-wrap lp-demo" aria-labelledby="demo-title">
      <SectionLabel number="05">SEE IT IN MOTION</SectionLabel>
      <div className="lp-section-heading"><h2 id="demo-title">Beyond the explanation,<br/><em>watch the actual footage.</em></h2><p>This is real public store footage.<br/>See the detections and linked paths,<br/>including the people and moments the model misses.</p></div>
      <div className="lp-demo-player"><div className="lp-demo-title"><span><i/> REAL STORE / MODEL OUTPUT</span><span>52 SEC · 720 × 404 SOURCE</span></div><video controls playsInline preload="metadata" poster={asset('retail-bbox.jpg')} src={asset('demo-bbox.mp4')} aria-label="Real-store person detection and anonymous trajectory demo"/><div className="lp-demo-caption"><div><strong>Person BBoxes · Temporary IDs · Movement paths</strong><span>Pretrained MobileNet-SSD applied to real store footage</span></div><a href={asset('demo-bbox.mp4')} download><ArrowDownToLine size={16}/> Download video</a></div></div>
      <div className="lp-source-note"><ShieldCheck size={20}/><div><strong>Source footage and reuse terms, together.</strong><p>Video source: <a href={source} target="_blank" rel="noopener noreferrer">Intel IoT DevKit / sample-videos contributors <ArrowUpRight size={12}/></a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 <ArrowUpRight size={12}/></a></p><small>Original 00:08–01:00 excerpt · Resampled to 15 fps · Audio removed · Analysis overlays added. Filmed in a real housewares store. Occlusion-related misses and fragmented IDs remain.</small></div></div>
    </section>

    <section className="lp-builder-section"><div className="lp-wrap lp-builder"><div><span className="lp-small-eyebrow">BUILT IN THE OPEN</span><h2>Share the results.<br/>Open the pipeline.</h2><p>Explore reproducible code, pipeline documentation,<br/>and actual observation data on GitHub.</p></div><div className="lp-builder-actions"><a className="lp-button lp-button-dark" href={REPOSITORY} target="_blank" rel="noopener noreferrer"><Github size={19}/> GitHub repository <ArrowUpRight size={18}/></a><a className="lp-text-link" href={`${REPOSITORY}/blob/main/docs/pipeline.md`} target="_blank" rel="noopener noreferrer">Read the pipeline <ArrowRight size={17}/></a><a className="lp-workspace-link" href="#/workspace"><Box size={16}/> Open analysis workspace <ArrowUpRight size={15}/></a></div></div></section>
    <footer className="lp-footer lp-wrap"><a className="lp-footer-brand" href="#"><Store size={23}/>tracker.ai</a><p>A new view of space, one observation at a time.</p><div><span>RETAIL VIDEO ANALYTICS / PROTOTYPE</span><a href={REPOSITORY} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository"><Github size={18}/></a><a href="#main-content" aria-label="Back to top"><ArrowDown className="lp-up" size={18}/></a></div></footer>
  </div>;
}
