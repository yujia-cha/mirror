---
name: deploy-pages
description: Deploy this app to GitHub Pages or diagnose a broken deployment — base path, workflow permissions, blank page, 404 on data files. Use when setting up Pages, when the deployed site misbehaves, or when the base URL changes.
---

# GitHub Pages 배포

## 최초 1회 설정 (사람이 해야 함)

저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions**. 이걸 켜지 않으면 `deploy.yml`이 "Pages is not enabled"로 실패한다.

## 배포 흐름

`main`에 푸시하면 `.github/workflows/deploy.yml`이 돈다. build 잡이 `VITE_BASE=/<repo>/`로 빌드해 `dist`를 Pages 아티팩트로 올리고, deploy 잡이 게시한다. 권한은 `pages: write` + `id-token: write` + `contents: read`만 필요하다 — 더 넓히지 말 것.

```bash
gh run list --workflow=deploy.yml --limit 3
gh run watch
```

## base 경로

Vite의 `base`는 `process.env.VITE_BASE ?? '/'`다.

- 로컬 `npm run dev` / `npm run preview` → `/`
- Pages → `/<repo>/` (워크플로가 저장소 이름으로 자동 설정)
- 커스텀 도메인을 붙이면 `/`가 맞다. 워크플로의 `VITE_BASE`를 `/`로 바꾸고 `public/CNAME`을 추가한다.

앱 코드에서 정적 파일을 참조할 때는 **반드시** `import.meta.env.BASE_URL`을 앞에 붙인다(`fetch(\`${import.meta.env.BASE_URL}data/gifts.json\`)`). 절대 경로 `/data/...`는 Pages에서 404가 된다.

## 흔한 증상

| 증상 | 원인 | 조치 |
|---|---|---|
| 흰 화면, 콘솔에 JS 404 | base 경로 불일치 | `VITE_BASE`가 `/<repo>/`인지, HTML의 script src가 그 경로인지 확인 |
| 앱은 뜨지만 "데이터를 불러올 수 없습니다" | `fetch`가 `BASE_URL` 없이 절대 경로 사용 | `src/core/data/load.ts`의 경로 조립 확인 |
| `public/data`가 배포물에 없음 | 파일이 커밋되지 않음 | `public/data`는 생성물이지만 **커밋 대상**이다. `npm run data:build` 후 커밋 |
| "Pages is not enabled" | Source 설정 누락 | 위의 최초 1회 설정 |
| 배포는 성공인데 옛 화면 | 브라우저/CDN 캐시 | 하드 리로드. 해시 없는 `index.html`은 짧게 캐시된다 |

## 롤백

이전 성공 커밋에서 `workflow_dispatch`로 다시 돌리거나, `git revert` 후 `main`에 푸시한다. Pages는 마지막 성공 배포를 계속 서비스하므로 실패한 배포가 사이트를 내리지는 않는다.
