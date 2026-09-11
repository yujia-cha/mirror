# 리뷰 가이드

이 저장소는 마일스톤 단위로 커밋되어 있습니다. 각 마일스톤에 `docs/review/M{n}.md`가 있고, 변경 요약·읽는 순서·검증 로그·확인해 주셨으면 하는 점이 적혀 있습니다.

## 읽는 순서

1. **[M0](M0.md)** — 스캐폴드, Claude Code 설정(에이전트·스킬·훅), 문서
2. **[M1](M1.md)** — 게임 데이터 파이프라인과 생성 데이터
3. **[M2](M2.md)** — 루트 계산 코어와 테스트
4. **[M3](M3.md)** — 웹 UI
5. **[M5](M5.md)** — 데이터 갱신 자동화 (M4 배포는 워크플로와 PR 자체라 별도 문서가 없습니다)

처음 보신다면 도메인 규칙부터 확인하는 편이 빠릅니다: `CLAUDE.md` → `docs/research/mechanics.md` → `src/core/schema.ts` → `data/curated/rules.json`.

## 로컬에서 확인하기

```bash
git fetch origin claude/mirror-dungeon-deck-router-h3il0h
git checkout claude/mirror-dungeon-deck-router-h3il0h
npm ci

npm run check                  # lint + typecheck + test(135개) + 데이터 검증
npm run data:build             # 생성물 재현성 확인 — 이후 git status가 깨끗해야 함
npm run dev                    # http://localhost:5173

# 루트 계산을 콘솔에서 직접 재현
npm run route -- --deck 10101,10403 --want 9283,9088 --floors 1-5 --difficulty hard --explain
```

`git log --oneline --reverse`로 마일스톤 순서대로 커밋을 읽을 수 있습니다.

## 의견 남기는 방법

- **코드**: GitHub PR의 Files changed에서 라인 코멘트. 이 세션이 PR을 구독하고 있어 코멘트가 오면 반영해 푸시하고 스레드에 답합니다.
- **데이터 정확성**(예: "이 기프트는 Hard 전용이 아니다"): 코드가 아니라 `data/curated/*.json` 오버라이드로 반영됩니다. 기프트 id와 근거(나무위키 링크, 인게임 스크린샷)를 남겨 주세요.
- **큰 설계 변경**: PR 코멘트보다 세션 대화로 지시하는 편이 빠릅니다.

## 확인이 필요한 값

| 항목 | 현재 상태 | 확인 방법 |
|---|---|---|
| E.G.O 기프트 관측 별빛 비용 | `data/curated/rules.json`에 구버전 값 70/160/270, `verified: false` | 인게임에서 관측 1·2·3개 비용 확인 후 값 갱신 |
| 히든 팩 「뽕.황」(3001) 등장 규칙 | 커뮤니티 추정치 기록, 루트 계산에는 미사용 | 확인되면 `hiddenPack.verified`를 true로 |
| 인격 키워드 도출 | 183명 중 177명 자동 도출, 6명은 키워드 없음 | 본인 덱 인격의 키워드 표시가 맞는지 |
| 특수 화상/출혈 등 변형 부여 | 1차 구현에서는 판정하지 않음(`special: false`) | 「및 특수 X」 형태 조건(9158, 9162 등)이 필요하면 큐레이션 보정 |
