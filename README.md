# store.ai

**실제 매장 영상에서 사람의 움직임을 수집하고, 공간 위에 체류 패턴을 펼칩니다.**

CCTV → 사람 탐지 → 익명 트랙 → 관찰 데이터 → 바닥 투영 → 3D 체류맵으로 이어지는 프로토타입입니다. 실제 생활용품 매장 영상의 BBox·동선 데모와 시간에 따라 관찰이 쌓이는 과정을 제공합니다.

[프로젝트 사이트 배포 대상](https://ikjoo5.github.io/cafe.ai/) · [파이프라인 상세](docs/pipeline.md) · [배포 안내](docs/deployment.md)

![실제 관찰 데이터의 3D 체류 히트맵](public/showcase/dwell-3d.png)

## 무엇을 보여주나요?

| 구성 | 내용 |
| --- | --- |
| 프로젝트 웹사이트 | 구조 설명, 실제 매장 예시, 데이터 누적 이미지, 데모 영상 |
| 실제 관찰 결과 | 사전학습 MobileNet-SSD의 사람 BBox·임시 추적 ID·좌표·관찰시간 |
| 3D 체류맵 | 추정 발 위치를 수동 보정한 바닥에 투영한 상대 체류량 |
| 데이터 내보내기 | 프레임별 CSV·JSON, 바닥 좌표·밀도 격자, PNG·MP4 |
| 로컬 분석 도구 | 영상 업로드, 구역 설정, CPU 추론 및 결과 생성 |

웹사이트의 복잡한 확장 매장 이미지는 **구조 설명용 시각화**입니다. 실제 관측 결과와 별도로 표시합니다. 실제 결과의 매대 배치 역시 수동 재구성이며, 실측 도면이나 자동 3D 복원은 아닙니다.

## 실제 데모 결과

기본 데모는 Intel이 공개한 **실제 생활용품 매장** 영상입니다. 원본 8–60초 구간을 52초·15fps로 발췌하고 음성을 제거했습니다.

| 관찰 항목 | 결과 |
| --- | ---: |
| 영상 길이 / 표본 프레임 | 52초 / 156개 |
| 사람 탐지 관찰 | 372건 |
| 최대 동시 탐지 | 5명 |
| 바닥 투영 / 제외 | 296건 / 76건 |
| 바닥에 반영된 관찰시간 | 98.665인·초 |

18개의 임시 트랙 ID가 생겼지만, 가림에 따른 ID 분리가 있어 **방문자 18명이라는 뜻은 아닙니다**. 발 위치가 화면 아래에서 잘린 59건과 보정 영역 밖 17건은 3D 히트맵에서 제외했습니다.

- [BBox·동선 영상](public/showcase/demo-bbox.mp4)
- [3D 히트맵 PNG](public/showcase/dwell-3d.png)
- [관찰 CSV](public/showcase/detections.csv) · [전체 JSON](artifacts/store-ai-real-analysis.json)
- [바닥 투영 좌표 CSV](artifacts/store-ai-floor-points.csv) · [격자·보정 정보 JSON](artifacts/store-ai-floor-heatmap.json)

## 로컬 실행

Python 3.12, Node.js 22.12 이상, npm, FFmpeg가 필요합니다.

```bash
git clone https://github.com/ikjoo5/cafe.ai.git
cd cafe.ai
bash scripts/setup.sh
bash scripts/dev.sh
```

개발 서버는 5173, FastAPI는 8000 포트를 사용합니다. 소개 페이지에서 **분석 워크스페이스**를 열면 로컬 분석 화면으로 이동합니다. 기존 클라우드 체크아웃에서 작업할 때는 그 체크아웃을 그대로 사용하며 별도 Git worktree가 필요하지 않습니다.

GitHub Pages에는 소개 페이지와 **미리 수집한 공개 데이터의 읽기 전용 워크스페이스**를 배포합니다. Pages에서 새 영상을 업로드해 서버 추론을 실행하지 않습니다. 자신의 영상 분석은 로컬 API에서 수행합니다.

```bash
# 자신의 영상에서 좌표·시간을 수집하고 MP4 생성
.venv/bin/python scripts/collect.py /path/to/store.mp4 --output artifacts/my-store

# 실제 공개 샘플의 분석 결과 재생성
.venv/bin/python scripts/render_retail_demo.py

# 바닥 투영 좌표와 시간 가중 격자 생성
npm run export:floor
```

업로드는 최대 100MB·120초입니다. `--no-render`는 데이터만 수집하고, `--zones zones.json`은 관찰 구역을 지정합니다. 다른 카메라를 3D로 표현하려면 해당 카메라의 바닥 보정을 별도로 설정해야 합니다.

## 구조

```text
src/Landing.tsx                정적 프로젝트 소개 페이지
src/App.tsx                    분석 워크스페이스
src/FloorHeatmap.tsx           Three.js 매장 그래픽·PNG 내보내기
src/floorProjection.ts         수동 원근 보정·시간 가중 격자
server/analysis.py             프레임 추출·탐지·임시 추적·집계
server/detector.py             사전학습 MobileNet-SSD CPU 추론
server/exports.py              원시 관찰 CSV
server/render.py               BBox·동선 MP4
scripts/prepare_retail_demo.py 공개 원본 확인·발췌·출처 기록
scripts/setup_model.py         고정 모델 버전·SHA-256 확인
public/showcase/               웹사이트에 포함되는 공개 데모 자산
docs/pipeline.md               단계별 처리·데이터 사전·측정 한계
```

## 검증

```bash
.venv/bin/python -m unittest discover -s tests -v
npm run test:floor
npm run build
```

기존 검증은 백엔드 24개와 바닥 투영 14개 사례를 포함합니다. 브라우저 검증 명령과 범위는 [검증 기록](docs/validation.md)에 있습니다. 테스트 통과는 탐지 정확도나 실제 체류시간 오차의 검증을 뜻하지 않습니다.

## 출처와 해석 범위

원본: [Intel IoT DevKit / sample-videos — store-aisle-detection.mp4](https://github.com/intel-iot-devkit/sample-videos/blob/57978890822836f2b4743852f04f62fc511757e4/store-aisle-detection.mp4). 이용 조건: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [라이선스 사본](docs/licenses/intel-sample-videos-CC-BY-4.0.txt). 발췌·프레임률 변환·무음 변환·BBox·히트맵 추가 등 수정 내역을 영상과 데이터에 기록합니다. 원본 제공자의 보증이나 제휴를 의미하지 않습니다.

모델은 [MobileNet-SSD](https://github.com/chuanqi305/MobileNet-SSD)의 사전학습 person 클래스를 사용합니다. 새 학습·매장 데이터 미세조정·얼굴 인식은 하지 않았습니다. 모델 누락·가림·임시 ID 교체가 있으며, 개인 신원·구매 의도·직원 성과·필요 인력 수를 판정하지 않습니다.

로컬 업로드와 결과는 `server/data/uploads/`, `server/data/results/`, `server/data/media/`에 보관하며 Git에서 제외합니다. 공개 웹사이트에는 재사용 조건을 확인한 샘플과 그 결과만 포함합니다.
