# 실제 매장 영상 데이터 수집 데모

아래 이미지·영상은 로컬 생성 결과입니다. 중복 바이너리는 Git에 포함하지 않고, 웹사이트에 사용하는 공개본은 `public/showcase/`에 보관합니다. 재생성 명령은 프로젝트 README를 참고하세요.

## 3D 그래픽 체류 히트맵 (현재 기본)

- `store-ai-3d-dwell-heatmap.png`: 공유용 2200×1740 PNG. 실제 관측 발 위치와 관찰시간으로 만든 3D 바닥 히트맵.
- `store-ai-3d-dashboard.png`, `store-ai-3d-mobile.png`: 인터랙티브 화면.
- `store-ai-floor-heatmap.json`: 원근 보정점·관찰 시간 가중 격자·포함/제외 관찰·출처.
- `store-ai-floor-points.csv`: 실제 각 관찰의 영상 시각·트랙·평면 u,v 좌표·초 단위 가중치.

매장 형상은 실제 영상 구조를 참고한 수동 재구성이며 실측 도면은 아니다. 372건 중296건을 투영했고, 잘린 발59건·바닥 밖17건을 제외했다. 실제 관찰 합계123.996인·초 중98.665인·초를 바닥에 반영했다. 색상은 선택 구간 내 상대값이다. 기존 영상 히트맵은 BBox 중심의 영상 좌표 누적으로 기준이 다르며 이전 결과로 보존한다.

`node scripts/capture-floor.mjs`는 저장된 실제 관찰 결과를 재렌더링해 PNG와 스크린샷을 만든다. API와 Vite를 먼저 실행해야 한다.

## 기본 데모: 실제 공개 생활용품 매장

- `store-ai-real-bbox.mp4`: 사전학습 MobileNet-SSD의 실제 사람 BBox·익명 ID·동선.
- `store-ai-real-heatmap.mp4`: 실제 탐지 관찰시간을 누적한 히트맵.
- `store-ai-real-analysis.json`, `store-ai-real-detections.csv`: 실제 영상의 원시 관찰 데이터와 출처.
- `store-ai-real-bbox.jpg`, `store-ai-real-heatmap.jpg`: 결과 미리보기.

출처: [Intel IoT DevKit / sample-videos](https://github.com/intel-iot-devkit/sample-videos/blob/57978890822836f2b4743852f04f62fc511757e4/store-aisle-detection.mp4), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 원본8–60초를15fps52초로 발췌하고 음성을 제거했으며, 분석 오버레이와 출처 여백을 추가했습니다. 원본은 생활용품 매장이며 식품 마트 영상은 아닙니다. 라이선스 사본: `docs/licenses/intel-sample-videos-CC-BY-4.0.txt`.

실제 검출 결과에는 가림으로 인한 누락, ID 분리·교체가 있습니다. 임시 트랙 수를 방문자 수로 해석하지 않습니다. 히트맵은 관찰된 BBox 중심의 영상 좌표 밀도로, 보정된 바닥 밀도나 실제 구매 의도를 나타내지 않습니다.

## 이전 검증 자료: 합성·야외 보행자 (기본 데모 아님)

- `store-ai-bbox-demo.mp4`: 직접 제작한 **합성 마트** 영상의 사람별 BBox·익명 ID·동선. 색상 마커 검출 결과입니다.
- `store-ai-heatmap-demo.mp4`: 같은 영상의 관찰시간 가중 누적 체류 히트맵. 실제 온도가 아닙니다.
- `store-ai-heatmap.jpg`: 히트맵 미리보기.
- `store-ai-demo-analysis.json`, `store-ai-detections.csv`: 합성 영상의 원시 관찰 데이터.
- `person-bbox-demo.mp4`, `person-heatmap-demo.mp4`: **사전학습 MobileNet-SSD 실제 추론 검증**. OpenCV 공식 공개 보행자 테스트 영상 12초를 사용했으며 마트 영상은 아닙니다.
- `pretrained-validation/analysis.json`, `pretrained-validation/detections.csv`: 해당 사전학습 검증의 원시 관찰 데이터.

사전학습 검증 입력: [OpenCV 4.12.0 samples/data/vtest.avi](https://github.com/opencv/opencv/blob/4.12.0/samples/data/vtest.avi), 앞12초. 검증 결과는 카페나 마트의 실제 성능 평가가 아닙니다. 실제 매장의 체류시간을 측정하려면 해당 매장 영상에서 누락·가림·ID 교체를 확인해야 합니다.

두 방식 모두 화면용 숫자를 임의로 넣지 않고 디코딩된 영상 프레임에서 좌표를 수집합니다. 합성 색상 검출과 실제 사전학습 검출은 서로 다른 방법이며 결과에 방법과 출처를 기록합니다. 히트맵은 BBox 중심 좌표를 사용하므로 바닥 평면의 실측 밀도가 아닙니다. 감지되지 않은 사람은 데이터에 포함되지 않습니다.
