# GitHub Pages 배포

배포 대상은 `https://ikjoo5.github.io/cafe.ai/`입니다. GitHub Pages에는 정적 소개 페이지, 공개 예시 이미지·영상·데이터, 읽기 전용 워크스페이스를 배포합니다. FastAPI와 영상 추론 프로세스는 Pages에서 실행되지 않습니다.

## 자동 배포 흐름

[`pages.yml`](../.github/workflows/pages.yml)은 `main` 푸시 또는 수동 실행 시 다음 단계를 수행합니다.

1. Node.js 22와 lockfile 기준으로 `npm ci`
2. 바닥 투영 검증 `npm run test:floor`
3. `/cafe.ai/` 기본 경로와 정적 공개 모드로 Vite 빌드
4. GitHub Pages 아티팩트 업로드
5. `github-pages` 환경에 배포

사용하는 빌드 변수는 다음과 같습니다. 비밀 값은 아닙니다.

```text
VITE_BASE_PATH=/cafe.ai/
VITE_STATIC_SHOWCASE=true
```

이미지·영상·데이터와 번들은 `import.meta.env.BASE_URL`을 기준으로 참조합니다. `#/workspace`는 같은 정적 페이지에서 저장된 공개 관찰 데이터를 열며, 로컬 분석 API로 요청하지 않습니다. 웹사이트에서 새 영상을 업로드해 추론하지 않습니다.

## 최초 활성화

저장소에 Pages가 활성화되지 않았다면 저장소 관리자 권한으로 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 설정합니다. 그다음 `Deploy project site` 워크플로를 다시 실행할 수 있습니다.

워크플로는 기본 `GITHUB_TOKEN`으로 배포하며 별도 개인 토큰을 요구하지 않습니다. 다만 Pages의 **최초 활성화**와 일반 배포 권한은 다릅니다. [공식 `actions/configure-pages@v5` 정의](https://github.com/actions/configure-pages/blob/v5/action.yml)에 따르면 `enablement: true`는 기본 `GITHUB_TOKEN` 외 토큰이 필요하므로 이 저장소의 워크플로는 자동 활성화 옵션을 사용하지 않습니다.

필요한 Actions 권한은 빌드의 `contents: read`와 Pages 설정 조회용 `pages: read`, 배포의 `pages: write`와 `id-token: write`입니다. 조직 정책이나 환경 승인 규칙이 추가되어 있다면 해당 저장소의 정책을 따릅니다.

## 로컬에서 배포 결과 확인

```bash
npm ci
VITE_BASE_PATH=/cafe.ai/ VITE_STATIC_SHOWCASE=true npm run build
VITE_BASE_PATH=/cafe.ai/ npm run preview
```

미리보기 서버에서 `/cafe.ai/` 경로를 열어 이미지·동영상·다운로드·워크스페이스를 확인합니다. 소개 페이지의 데모 영상은 실제 Intel 매장 영상에서 생성한 BBox 영상이며, 개념 이미지는 실제 측정값으로 표기하지 않습니다.

## 배포 상태 확인

소스 푸시 성공과 웹사이트 배포 성공은 별개입니다. 저장소 **Actions**에서 `Deploy project site`의 실행 결과를 확인하고, 성공한 `deploy` 작업의 `page_url`과 실제 사이트 응답을 확인해야 합니다. 실패한 경우 빌드·Pages 설정·권한·환경 규칙 중 실제 실패한 단계를 기준으로 진단합니다.

## 로컬 분석과 공개 사이트의 차이

| 기능 | 공개 Pages | 로컬 개발 환경 |
| --- | --- | --- |
| 파이프라인 소개·이미지·데모 영상 | 지원 | 지원 |
| 저장된 공개 데이터·3D 체류맵 | 읽기 전용 | 지원 |
| 새 CCTV 영상 업로드·CPU 추론 | 미지원 | FastAPI로 지원 |
| 개인 업로드 파일 저장 | 없음 | Git에서 제외된 로컬 디렉터리 |

추론 API를 외부 서비스로 공개하려면 인증·사용자별 데이터 격리·보존기간·비동기 작업 관리 등을 별도로 구현해야 합니다. 현재 Pages 배포는 해당 API를 노출하지 않습니다.

## 기존 자기소개 사이트 보존

이 배포는 `ikjoo5/cafe.ai` 저장소의 `/cafe.ai/` 프로젝트 경로만 대상으로 합니다. `ikjoo5/ikjoo5.github.io` 저장소, 루트 자기소개 페이지, CNAME·사용자 사이트 설정은 변경하지 않습니다.
