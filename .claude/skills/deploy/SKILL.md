---
name: deploy
description: Deploy this app (Cloudflare Pages by default, GitHub Pages as a manual fallback) or diagnose a broken deployment — base path, build settings, blank page, 404 on data files, missing images. Use when setting up hosting, when the deployed site misbehaves, when connecting the image host, or when the base URL changes.
---

# 배포

프로덕션은 **Cloudflare Pages**(Git 연동)다. `main`에 푸시하면 Cloudflare가 직접 빌드·배포하고, 다른 브랜치와 PR은 미리보기 URL을 받는다. GitHub Actions 분이나 시크릿은 쓰지 않는다. GitHub Pages는 `deploy.yml`을 수동 실행(`workflow_dispatch`)하는 예비 경로로만 남아 있다.

## 최초 1회 설정 (사람이 대시보드에서)

1. Cloudflare → Workers & Pages → Create → **Pages → Connect to Git** → `yujia-cha/mirror`.
2. Production branch `main` · Build command `npm run build` · Build output `dist` · Root `/`. Node 버전은 저장소의 `.nvmrc`(22)를 읽는다.
3. 환경 변수는 필요할 때 `VITE_ASSET_BASE`만(아래 「이미지」). `VITE_BASE`는 두지 않는다 — Cloudflare는 루트 경로(`/`)로 서비스한다.
4. 저장하면 첫 빌드가 돌고 `<project>.pages.dev` 주소가 나온다. 커스텀 도메인은 Pages 프로젝트 → Custom domains에서 붙인다(코드 변경 없음).

`public/_headers`가 캐시 헤더를 정한다: 해시 붙은 `assets/*`는 1년 immutable, `data/*`는 10분(데이터 갱신이 곧 반영되도록).

## 이미지 (선택)

저장소에는 게임 이미지가 없다(Project Moon 에셋 재배포 회피). 앱은 `VITE_ASSET_BASE`가 있으면 `{base}/gifts/{icon}.png`, `{base}/packs/{sprite}.png`를 시도하고 실패하면 회색 플레이스홀더로 돌아간다.

1. R2 버킷(예: `mirror-assets`) 생성 → 공개 접근(r2.dev 또는 커스텀 도메인) 활성화.
2. `gifts/{icon}.png` — `icon`은 `public/data/gifts.json`의 `icon`(대부분 id와 같다). `packs/{sprite}.png` — `sprite`는 `packs.json`의 `sprite`(`Burn_hard` 등).
3. Pages 프로젝트 환경 변수에 `VITE_ASSET_BASE=https://<버킷 공개 주소>`를 넣고 재배포. `<img>`만 쓰므로 CORS 설정은 필요 없다.

## GitHub Pages 예비 경로

Actions 탭에서 `Deploy to GitHub Pages (fallback)`를 수동 실행한다. **지금까지 마일스톤 배포는 전부 이 워크플로를 main에서 손으로 실행해 왔다**(M10~M17). main에 병합했다고 GitHub Pages가 갱신되지는 않으므로, 병합 뒤 반드시 실행하고 사이트 하단의 데이터 버전으로 확인한다. 이 워크플로만 `VITE_BASE=/<repo>/`로 빌드하므로 하위 경로에서도 동작한다. 저장소 Settings → Pages → Source가 GitHub Actions여야 한다.

## base 경로

Vite의 `base`는 `process.env.VITE_BASE ?? '/'`다. Cloudflare·로컬(`npm run dev`, `npm run preview`)은 `/`, GitHub Pages는 `/<repo>/`. 앱 코드에서 정적 파일을 참조할 때는 **반드시** `import.meta.env.BASE_URL`을 앞에 붙인다(`fetch(\`${import.meta.env.BASE_URL}data/gifts.json\`)`).

## 흔한 증상

| 증상 | 원인 | 조치 |
|---|---|---|
| Cloudflare 빌드 실패 `node: not found`/버전 오류 | `.nvmrc`를 못 읽음 | 프로젝트 설정에 `NODE_VERSION=22` 환경 변수 추가 |
| 흰 화면, 콘솔에 JS 404 | base 경로 불일치 | Cloudflare에 `VITE_BASE`가 설정돼 있으면 지운다. GitHub Pages는 `/<repo>/`인지 확인 |
| 앱은 뜨지만 "데이터를 불러올 수 없습니다" | `fetch`가 `BASE_URL` 없이 절대 경로 사용 | `src/core/data/load.ts`의 경로 조립 확인 |
| `public/data`가 배포물에 없음 | 파일이 커밋되지 않음 | `public/data`는 생성물이지만 **커밋 대상**이다. `npm run data:build` 후 커밋 |
| 아이콘이 전부 회색 | `VITE_ASSET_BASE` 미설정 또는 파일 이름 불일치 | 변수 값 끝에 `/` 없이, 경로는 `gifts/{icon}.png` |
| 배포는 성공인데 옛 데이터 | `data/*` 10분 캐시 | 잠시 뒤 하드 리로드 |
| PR 미리보기가 안 생김 | Git 연동이 프로덕션 브랜치만 빌드하도록 설정됨 | Pages 프로젝트 → Builds → Preview branches를 All로 |

## 롤백

Cloudflare Pages 프로젝트 → Deployments에서 이전 배포의 「Rollback to this deployment」를 누른다(즉시 반영). 또는 `git revert` 후 `main`에 푸시한다.

## 다른 호스트로 옮길 때

정적 파일뿐이라 어느 호스트든 된다. Netlify(무료 월 100 GB)·Vercel(비상업 한정)도 같은 빌드 설정(`npm run build` → `dist`)이면 그대로 동작하고, 하위 경로에 두는 호스트만 `VITE_BASE`를 맞추면 된다.
