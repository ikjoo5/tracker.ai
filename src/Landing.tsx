import { useEffect, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Braces, Check, ChevronRight, CircleDot, Code2, Database, FileJson, Focus, Github, Layers3, Menu, Move3D, Play, ScanLine, ShieldCheck, Store, Video, X } from 'lucide-react';
import './landing.css';

const REPOSITORY = 'https://github.com/ikjoo5/cafe.ai';
const asset = (name: string) => `${import.meta.env.BASE_URL}showcase/${name}`;
const source = 'https://github.com/intel-iot-devkit/sample-videos/blob/57978890822836f2b4743852f04f62fc511757e4/store-aisle-detection.mp4';
const steps = [
  { icon: Video, name: '영상 입력', en: 'INPUT', detail: '고정 카메라에서 시작합니다.', body: '공개 생활용품 매장 영상 52초를 발췌했습니다. 분석할 영상과 매장 구역을 정하고, 원본의 출처와 길이·해상도를 함께 기록합니다.', tag: 'CCTV / MP4', output: '영상 · 원본 메타데이터' },
  { icon: Focus, name: '사람 탐지', en: 'DETECTION', detail: '프레임에서 사람의 위치를 찾습니다.', body: '사전학습 MobileNet-SSD의 person 클래스를 사용해 사람마다 BBox 좌표와 탐지 점수를 수집합니다. 약 3fps로 표본을 관찰하며 가림에 따른 누락이 있을 수 있습니다.', tag: 'MobileNet-SSD', output: 'BBox · 탐지 점수 · 시각' },
  { icon: ScanLine, name: '익명 추적', en: 'TRACKING', detail: '흩어진 위치를 짧은 동선으로 연결합니다.', body: '인접 관찰의 중심점을 연결해 영상 안에서만 사용하는 임시 트랙 ID를 부여합니다. 얼굴이나 신원을 인식하지 않으며, 가림·교차 시 ID가 나뉠 수 있습니다.', tag: 'Anonymous tracks', output: '임시 ID · 위치 이력' },
  { icon: Database, name: '관찰 저장', en: 'COLLECTION', detail: '한 번의 움직임이 한 줄의 데이터가 됩니다.', body: '시각, 프레임 번호, 트랙 ID, 정규화·픽셀 좌표, 구역과 실제 표본 간격을 CSV와 JSON으로 저장합니다. 그림뿐 아니라 그 그림의 근거를 남깁니다.', tag: 'CSV + JSON', output: '재확인 가능한 관찰 레코드' },
  { icon: Move3D, name: '바닥 투영', en: 'PROJECTION', detail: '화면의 위치를 공간 위로 옮깁니다.', body: 'BBox 하단 중심을 발 위치로 추정해 수동 원근 보정으로 바닥에 투영합니다. 발이 잘렸거나 보정 영역 밖인 관찰은 제외하며, 실측 좌표를 주장하지 않습니다.', tag: 'Manual calibration', output: '바닥 좌표 · 포함/제외 기록' },
  { icon: Layers3, name: '체류 시각화', en: 'VISUALIZATION', detail: '쌓인 시간을 한 장의 공간 지도로 봅니다.', body: '투영된 위치에 관찰시간을 누적하고 가우시안 평활화를 적용합니다. 매대는 설명용 3D 배치로 재구성하며 색상은 선택 구간 안의 상대 체류량을 나타냅니다.', tag: '3D dwell map', output: '3D 체류맵 · PNG' },
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
    <a href="#main-content" className="lp-skip">본문으로 이동</a>
    <div className="lp-dark-shell">
      <header className="lp-header">
        <a className="lp-brand" href="#" aria-label="store.ai 처음으로"><Store size={25}/><span>store<span className="lp-brand-dot">.</span>ai</span><small>SPATIAL INTELLIGENCE</small></a>
        <nav className={`lp-nav ${menuOpen ? 'is-open' : ''}`} aria-label="프로젝트 메뉴">
          {[['#solution', '솔루션'], ['#pipeline', '파이프라인'], ['#data', '데이터'], ['#demo', '데모']].map(([href, label]) => <a href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a href={REPOSITORY} target="_blank" rel="noopener noreferrer" className="lp-nav-github"><Github size={16}/> GitHub <ArrowUpRight size={14}/></a>
        </nav>
        <button className="lp-menu-toggle" aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23}/> : <Menu size={23}/>}</button>
      </header>
      <main id="main-content">
        <section className="lp-hero lp-wrap" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow"><span/> CCTV → 공간 데이터 <i>PROJECT / 001</i></div>
            <h1 id="hero-title">매장의 움직임을,<br/><em>운영의 근거로.</em></h1>
            <p className="lp-hero-description">카메라에 담긴 순간을 연결하면<br/>사람이 머문 공간과 시간이 보입니다.</p>
            <p className="lp-hero-sub">사람 탐지와 익명 추적부터 데이터 수집, 3D 체류맵까지.<br/>기존 영상으로 시작하는 매장 관찰 파이프라인.</p>
            <div className="lp-hero-actions"><a className="lp-button lp-button-coral" href="#demo"><Play size={16} fill="currentColor"/> 실제 데모 보기 <ArrowUpRight size={17}/></a><a className="lp-text-link lp-light-link" href={REPOSITORY} target="_blank" rel="noopener noreferrer"><Github size={17}/> 소스코드 살펴보기 <ArrowRight size={16}/></a></div>
            <div className="lp-hero-status"><span/><strong>실제 공개 영상 기반 프로토타입</strong><i/>얼굴 인식 없이 임시 ID로 관찰</div>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-visual-meta"><span><Box size={13}/> A NEW WAY TO SEE YOUR STORE</span><span>3D / DWELL</span></div>
            <img src={asset('hero-heatmap.png')} alt="여러 매대와 통로의 체류 분포를 입체적으로 설명하는 확장 매장 3D 시각화" fetchPriority="high"/>
            <div className="lp-visual-caption"><span className="lp-concept-pill">CONCEPT VIEW</span><p>확장 매장 설명용 시각화<br/><strong>실제 측정 결과가 아닙니다.</strong></p><div className="lp-mini-legend"><i/><span>상대 체류</span></div></div>
            <div className="lp-hero-float"><CircleDot size={18}/><div><strong>From motion to meaning.</strong><span>움직임을 공간의 맥락으로</span></div></div>
          </div>
        </section>
        <div className="lp-proof-strip lp-wrap"><div className="lp-proof-intro"><span>THE REAL DEMO</span><p>짧은 영상에서도,<br/><strong>관찰의 근거는 남습니다.</strong></p></div><div><strong>52<small>초</small></strong><span>실제 매장 영상</span></div><div><strong>156<small>개</small></strong><span>수집 표본 프레임</span></div><div><strong>372<small>건</small></strong><span>사람 위치 관찰</span></div><div className="lp-proof-foot"><span>Intel 공개 생활용품 매장 영상</span><small>CC BY 4.0 · 사전학습 모델 적용</small></div></div>
      </main>
    </div>

    <section id="solution" className="lp-section lp-wrap lp-solution" aria-labelledby="solution-title">
      <SectionLabel number="01">SEE THE UNSEEN</SectionLabel>
      <div className="lp-section-heading"><h2 id="solution-title">영상은 기록합니다.<br/>우리는 <em>관찰 가능한 데이터</em>를 남깁니다.</h2><p>매장에 있는 카메라에서 출발합니다.<br/>누가 누구인지보다, 어디에 얼마나 머물렀는지를<br/>확인할 수 있도록 수집의 과정을 만듭니다.</p></div>
      <div className="lp-observation-grid lp-complex-grid">
        <figure className="lp-camera-card lp-complex-camera"><div className="lp-camera-chrome"><span><ScanLine size={13}/> COMPLEX STORE / SCENARIO</span><span>ILLUSTRATIVE</span></div><img src={asset('bbox-complex.png')} alt="진열대가 밀집한 넓은 매장에 여러 익명 사람 BBox를 표현한 생성 이미지. 실제 모델 추론 결과가 아닌 복잡한 매장 상황 설명용 시각화" loading="lazy"/><figcaption><div><span className="lp-concept-pill">설명용 생성 이미지</span><strong>복잡한 현장을 관찰하는 하나의 구조</strong><p>복잡한 매장 감지 상황 설명용 · 생성 이미지 · 실제 추론 결과 아님</p></div></figcaption></figure>
        <figure className="lp-camera-card lp-camera-detection"><div className="lp-camera-chrome"><span><Focus size={12}/> ACTUAL PUBLIC VIDEO</span><div className="lp-camera-switch" role="group" aria-label="실제 매장 원본과 추론 결과 비교"><button aria-pressed={cameraView === 'raw'} onClick={() => setCameraView('raw')}>원본</button><button aria-pressed={cameraView === 'observed'} onClick={() => setCameraView('observed')}>실제 추론</button></div></div><img src={asset(cameraView === 'raw' ? 'retail-frame.jpg' : 'retail-bbox.jpg')} alt={cameraView === 'raw' ? '실제 생활용품 매장을 촬영한 Intel 공개 원본 프레임' : '실제 공개 매장 영상에 MobileNet-SSD가 생성한 사람 바운딩 박스와 익명 트랙 ID'} loading="lazy"/><figcaption><div><span className="lp-measured-pill">실제 관찰 데이터</span><strong>{cameraView === 'raw' ? '카메라에 담긴 실제 생활용품 매장' : '현재 모델이 남긴 관찰 결과'}</strong><p>같은 시점의 원본과 추론을 비교하세요. Intel 공개 영상 · CC BY 4.0</p></div></figcaption></figure>
      </div>
      <div className="lp-note-row"><span><ShieldCheck size={16}/> 신원이 아닌, 위치와 시간에 집중합니다.</span><p>가림에 따른 탐지 누락과 ID 분리가 남아 있습니다. 트랙 수를 정확한 방문자 수로 해석하지 않습니다.</p></div>
    </section>

    <section id="pipeline" className="lp-pipeline-section" aria-labelledby="pipeline-title"><div className="lp-wrap">
      <SectionLabel number="02">BUILT TO BE TRACEABLE</SectionLabel>
      <div className="lp-section-heading"><h2 id="pipeline-title">하나의 영상이<br/><em>공간 데이터</em>가 되기까지.</h2><p>화려한 결과 뒤에도 근거가 있어야 합니다.<br/>영상에서 시각화까지, 각 단계의 입력과 출력을<br/>다시 확인할 수 있는 구조로 연결했습니다.</p></div>
      <div className="lp-pipeline-steps" role="tablist" aria-label="영상 분석 파이프라인 단계">{steps.map(({ icon: Icon, name, en }, i) => <button id={`pipeline-step-${i}`} role="tab" aria-selected={selectedStep === i} aria-controls="pipeline-detail" className={selectedStep === i ? 'is-selected' : ''} key={name} onClick={() => setSelectedStep(i)}><span className="lp-step-number">0{i+1}<i/></span><span className="lp-step-icon"><Icon size={25}/></span><strong>{name}</strong><small>{en}</small>{i < steps.length - 1 && <ChevronRight className="lp-step-arrow" size={20}/>}</button>)}</div>
      <div id="pipeline-detail" className="lp-pipeline-detail" role="tabpanel" aria-labelledby={`pipeline-step-${selectedStep}`}><div className="lp-detail-number">0{selectedStep+1}<span>/ 06</span></div><div className="lp-detail-copy"><span>{step.tag}</span><h3>{step.detail}</h3><p>{step.body}</p></div><div className="lp-detail-output"><span>이 단계가 남기는 것</span><strong><Check size={16}/>{step.output}</strong></div></div>
      <div className="lp-pipeline-bottom"><p><Code2 size={17}/> Python · OpenCV · FastAPI · React · Three.js</p><a href={`${REPOSITORY}/blob/main/docs/pipeline.md`} target="_blank" rel="noopener noreferrer">파이프라인 문서 보기 <ArrowUpRight size={16}/></a></div>
    </div></section>

    <section id="spatial" className="lp-section lp-wrap lp-spatial" aria-labelledby="spatial-title">
      <SectionLabel number="03">TIME TAKES SHAPE</SectionLabel>
      <div className="lp-section-heading"><h2 id="spatial-title">머무른 시간이<br/><em>공간 위에 펼쳐집니다.</em></h2><p>사람이 오래 관찰된 곳은 더 따뜻한 색으로.<br/>단편적인 장면을 넘어 매대와 통로의 관계를<br/>입체적으로 살펴보는 방식입니다.</p></div>
      <div className="lp-spatial-tabs" role="tablist" aria-label="3D 체류맵 예시 구분"><button role="tab" aria-selected={spatialView === 'concept'} onClick={() => setSpatialView('concept')}>확장 매장 시각화 예시 <span>CONCEPT</span></button><button role="tab" aria-selected={spatialView === 'actual'} onClick={() => setSpatialView('actual')}>이번 영상의 실제 관찰 결과 <span>MEASURED</span></button></div>
      <figure className={`lp-spatial-figure ${spatialView === 'actual' ? 'is-actual' : ''}`}><div className="lp-spatial-image"><img src={asset(spatialView === 'concept' ? 'hero-heatmap.png' : 'dwell-3d.png')} alt={spatialView === 'concept' ? '여러 매대를 배치한 확장 매장의 설명용 입체 체류 시각화, 실제 측정값이 아닌 개념 이미지' : '실제 공개 영상의 296개 관찰을 수동 원근 보정으로 바닥에 투영한 이번 프로젝트의 3D 체류 히트맵'} loading="lazy"/></div><figcaption><div><span className={spatialView === 'concept' ? 'lp-concept-pill' : 'lp-measured-pill'}>{spatialView === 'concept' ? '설명용 시각화' : '실제 관찰 데이터'}</span><h3>{spatialView === 'concept' ? '매장이 넓어져도, 같은 데이터 흐름으로.' : '작은 실제 예시에서, 수집의 근거부터.'}</h3><p>{spatialView === 'concept' ? '복잡한 매대와 여러 통로에서 체류 분포를 어떻게 표현할지 보여주는 개념 이미지입니다. 실제 영상의 측정 결과와 구분합니다.' : '372건의 관찰 중 발 위치를 추정할 수 있는 296건을 투영했습니다. 매대 형상과 원근 보정은 수동 재구성이며 실측 도면이 아닙니다.'}</p></div><a className="lp-text-link" href="#/workspace">3D 워크스페이스 열기 <ArrowUpRight size={17}/></a></figcaption></figure>
      <div className="lp-spatial-foot"><div className="lp-large-legend"><span>낮은 상대 체류</span><i/><span>높은 상대 체류</span></div><p>상대 체류 색상은 온도, 구매 의도 또는 보정된 실측 인원 밀도가 아닙니다.</p></div>
    </section>

    <section id="data" className="lp-data-section" aria-labelledby="data-title"><div className="lp-wrap">
      <SectionLabel number="04">EVERY OBSERVATION COUNTS</SectionLabel>
      <div className="lp-section-heading"><h2 id="data-title">한 프레임씩 쌓이면,<br/><em>비교할 수 있는 기록</em>이 됩니다.</h2><p>탐지된 순간의 좌표와 그 순간의 관찰 간격.<br/>작은 레코드를 차곡차곡 보존해<br/>시각화의 근거로 다시 사용합니다.</p></div>
      <div className="lp-accumulation-frame"><div className="lp-window-bar"><div><i/><i/><i/></div><span>OBSERVATION → ACCUMULATION → SPACE</span><Database size={15}/></div><img src={asset('accumulation.png')} alt="동일한 실제 매장 관찰 데이터가 시간 구간별로 누적되며 위치 분포와 레코드가 쌓이는 예시" loading="lazy"/><div className="lp-accumulation-caption"><strong>같은 영상, 시간에 따라 달라지는 누적 관찰</strong><span>실제 수집 데이터로 만든 예시 · 임의의 고객 수를 넣지 않았습니다.</span></div></div>
      <div className="lp-data-grid"><div className="lp-data-copy"><div className="lp-small-eyebrow"><Database size={15}/> OPEN OBSERVATION DATA</div><h3>그림만 남기지 않습니다.<br/>그림을 만든 데이터도 함께.</h3><p>시간·트랙·좌표·탐지 점수·구역·관찰 간격을 저장합니다. CSV는 스프레드시트로, JSON은 다음 분석과 재현에 사용할 수 있습니다.</p><div className="lp-downloads"><a href={asset('observation-data.csv')} download><ArrowDownToLine size={16}/> CSV 다운로드</a><a href={asset('observation-data.json')} download><FileJson size={16}/> JSON 다운로드</a></div><small>아래 레코드는 실제 결과의 일부입니다. 탐지 점수는 정확도 보증이 아닙니다.</small></div><div className="lp-data-table-card"><div className="lp-table-title"><span><Braces size={17}/> observations.csv</span><span>PREVIEW / 372 RECORDS</span></div><div className="lp-table-scroll"><table><thead><tr><th>time (s)</th><th>track</th><th>BBox (x, y, w, h)</th><th>score</th><th>Δt (s)</th></tr></thead><tbody>{records.map((r, i) => <tr key={`${r.track_id}-${r.time_seconds}-${i}`}><td>{r.time_seconds.toFixed(3)}</td><td><span>{r.track_id}</span></td><td>{r.bbox.map(n => n.toFixed(3)).join(', ')}</td><td>{r.confidence.toFixed(3)}</td><td>{r.sample_seconds.toFixed(3)}</td></tr>)}</tbody></table></div><div className="lp-table-bottom"><Check size={14}/> 원본 시각과 관찰 간격을 보존한 레코드 <span>CSV / JSON</span></div></div></div>
    </div></section>

    <section id="demo" className="lp-section lp-wrap lp-demo" aria-labelledby="demo-title">
      <SectionLabel number="05">SEE IT IN MOTION</SectionLabel>
      <div className="lp-section-heading"><h2 id="demo-title">설명 다음에는,<br/><em>실제 영상으로 확인하세요.</em></h2><p>합성 장면이 아닌 실제 공개 매장 영상입니다.<br/>모델이 찾은 사람, 연결한 동선,<br/>그리고 놓치는 구간까지 그대로 담았습니다.</p></div>
      <div className="lp-demo-player"><div className="lp-demo-title"><span><i/> REAL STORE / MODEL OUTPUT</span><span>52 SEC · 720 × 404 SOURCE</span></div><video controls playsInline preload="metadata" poster={asset('retail-bbox.jpg')} src={asset('demo-bbox.mp4')} aria-label="실제 생활용품 매장 사람 탐지와 익명 동선 데모 영상"/><div className="lp-demo-caption"><div><strong>사람 BBox · 익명 ID · 이동 경로</strong><span>사전학습 MobileNet-SSD를 실제 매장 영상에 적용한 결과</span></div><a href={asset('demo-bbox.mp4')} download><ArrowDownToLine size={16}/> 영상 다운로드</a></div></div>
      <div className="lp-source-note"><ShieldCheck size={20}/><div><strong>공개 영상과 이용 조건을 함께 남깁니다.</strong><p>영상 출처: <a href={source} target="_blank" rel="noopener noreferrer">Intel IoT DevKit / sample-videos contributors <ArrowUpRight size={12}/></a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 <ArrowUpRight size={12}/></a></p><small>원본 00:08–01:00 발췌 · 15fps 변환 · 음성 제거 · 분석 오버레이 추가. 실제 생활용품 매장이며 식품 마트 영상은 아닙니다. 가림으로 인한 누락과 ID 분리가 남아 있습니다.</small></div></div>
    </section>

    <section className="lp-builder-section"><div className="lp-wrap lp-builder"><div><span className="lp-small-eyebrow">BUILT IN THE OPEN</span><h2>결과에서 멈추지 않고,<br/>구조까지 공유합니다.</h2><p>재현 가능한 코드, 파이프라인 문서와 실제 수집 결과를<br/>GitHub에서 확인하세요.</p></div><div className="lp-builder-actions"><a className="lp-button lp-button-dark" href={REPOSITORY} target="_blank" rel="noopener noreferrer"><Github size={19}/> GitHub 저장소 <ArrowUpRight size={18}/></a><a className="lp-text-link" href={`${REPOSITORY}/blob/main/docs/pipeline.md`} target="_blank" rel="noopener noreferrer">파이프라인 문서 읽기 <ArrowRight size={17}/></a><a className="lp-workspace-link" href="#/workspace"><Box size={16}/> 분석 워크스페이스 열기 <ArrowUpRight size={15}/></a></div></div></section>
    <footer className="lp-footer lp-wrap"><a className="lp-footer-brand" href="#"><Store size={23}/>store.ai</a><p>관찰이 쌓이면, 공간이 다르게 보입니다.</p><div><span>RETAIL VIDEO ANALYTICS / PROTOTYPE</span><a href={REPOSITORY} target="_blank" rel="noopener noreferrer" aria-label="GitHub 저장소"><Github size={18}/></a><a href="#main-content" aria-label="페이지 맨 위로"><ArrowDown className="lp-up" size={18}/></a></div></footer>
  </div>;
}
