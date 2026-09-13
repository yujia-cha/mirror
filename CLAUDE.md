# CLAUDE.md

림버스 컴퍼니 **거울 던전** 루트 플래너. 사용자가 덱(인격 12인)과 원하는 E.G.O 기프트를 고르면, 그 기프트를 모으기 위한 층별 테마팩 루트를 계산해 보여주는 정적 웹앱이다. 백엔드는 없고 Cloudflare Pages로 배포한다(GitHub Pages는 수동 예비).

비상업 팬 프로젝트다. 게임 데이터와 텍스트의 권리는 Project Moon에 있다.

## 명령어

```bash
npm run dev            # 개발 서버
npm run build          # 타입 검사 + 프로덕션 빌드
npm test               # 단위 테스트
npm run check          # lint + typecheck + test + data:validate  ← 커밋 전 필수
npm run data:fetch     # 원본 게임 데이터 내려받기 (sources.lock.json 기준)
npm run data:build     # data/raw + data/curated → public/data
npm run data:validate  # 스키마 · 참조 무결성 · 도메인 불변식 검사
npm run data:diff      # 이전 커밋 대비 데이터 변경 요약
npm run data:changelog # 갱신 내역을 docs/research/changelog.md에 한 줄 추가
npm run route -- --deck 10101,... --want 9088,... --floors 1-5 --difficulty hard
```

## 디렉터리 규칙

| 경로 | 성격 | 규칙 |
|---|---|---|
| `data/raw/**` | vendoring된 게임 원본 | 손으로 고치지 않는다. `data:fetch`가 덮어쓴다 |
| `data/curated/**` | 사람이 적는 보정·상수 | 모든 항목에 `_source` 근거를 남긴다 |
| `public/data/**` | 생성물 (커밋 대상) | 손으로 고치지 않는다. `data:build`로만 만든다 |
| `src/core/**` | 순수 TS 로직 | React·DOM·fetch 금지(ESLint가 막는다). 결정적이어야 한다 |
| `src/app/**` | React UI | 계획 로직을 재구현하지 않고 `planRoute()`를 호출한다 |
| `scripts/**` | tsx로 실행하는 파이프라인 | 출력은 항상 결정적(정렬·고정 키 순서) |

## 도메인 규칙 (자세한 내용은 `md-domain` 스킬)

- 현재 시즌은 거울 던전 7 「이름과 거미의 거울」.
- 층: Normal/Hard 1~5, 평행중첩 6~10(1~5층 전부 Hard 필요), EXTREME 11~15(관측 불가).
- **Hard는 sticky** — 한 번 고르면 Normal로 못 돌아간다.
- **앱은 항상 1~15층·Hard로 계획한다**(`store.ts`의 `sanitizeOptions`가 고정). core의 `PlanOptions`·CLI는 층 범위·난이도를 그대로 받는다.
- 팩의 층 제한은 `exceptionConditions[].selectableFloors`이고 **0-기준**이다. `dungeonIdx`는 0=Normal, 1=Hard, 2=평행중첩, 3=EXTREME.
- 기프트 획득은 범용 / 테마팩 한정 / 조합 전용 / 시작으로 나뉜다. **범용은 "나올 수 있음"이고 확정이 아니다** — UI와 결과 문구가 이 차이를 분명히 해야 한다.
- **관측 지정(`observedGifts`)은 사용자의 결정이라 시작 기프트·플래너 추천보다 먼저 적용된다.** 팩에서 얻을 기프트뿐 아니라 범용 기프트에도 걸 수 있고, 관측하면 확정이다(`generalDrops`·경고에서 빠진다). 이미 보유했거나 미해결인 기프트의 지정은 조용히 건너뛰고, 계획에 없는 기프트의 지정만 `observation-trimmed`로 알린다.
- 조건부 기프트의 키워드 조건은 인격 태그가 아니라 **해당 키워드를 부여하는 공격 스킬 보유 수**로 센다. 소속 조건은 `associationList`로 센다. **특수 변형**(특수 충전·특수 출혈 …)은 `keywords[K].specialSkills`로 따로 세고, 조건에 「또는 특수 X」가 있을 때(`includesSpecial`)만 포함한다. 인격 칩은 이름만 보이고(개수 없음) 특수 변형은 「충전(특수)」·「특수 출혈」로 적는다.

## 코드 규칙

- 게임 상수는 코드에 박지 않고 `data/curated/rules.json`에 둔다.
- 스키마는 `src/core/schema.ts`(Zod) 한 곳에서 정의하고 파이프라인·앱·테스트가 공유한다.
- UI 문자열은 `src/app/i18n/`에 두고 **한국어 우선**, 영어는 보조로 병기한다.
- 정적 파일 참조는 항상 `import.meta.env.BASE_URL`을 붙인다(GitHub Pages 예비 경로가 하위 경로라서).
- 게임 이미지는 저장소에 두지 않는다. 아이콘·팩 이미지는 플레이스홀더이고 `VITE_ASSET_BASE`가 있을 때만 외부에서 불러온다.
- 계획이 불가능한 요구는 조용히 버리지 않고 `unresolved`에 이유와 함께 남긴다.
- 팩 단위 선택(`preferredPacks`·`bannedPacks`·`pinnedPacks`)은 core 옵션이다. UI는 팩 충돌 그룹(`conflictGroups`)에서 팩째로 포함·포기를 고르고, 루트는 노선도(세그먼트 = 같은 창의 팩 묶음)로 그린다.
- 런 진행 상태(`currentFloor`·`ownedGifts`·`unobtainableGifts`, `WantedGift.ingredientsAsGoals`)도 core 옵션이다. 앱은 `run` 슬라이스(기기에만 저장, 공유 링크 제외)와 `fusionGoal`(공유 링크 포함)에서 `planInputFor`로 만든다. 지나간 층은 `FloorPlan.passed`로만 남고 그 층의 `pinnedPacks`가 방문한 팩이다.
- 덱은 비어 있지 않다: 첫 방문은 **LCB 수감자 12인**으로 시작하고(`lib/default-deck.ts`), 저장된 덱·공유 링크가 우선한다.
- 아이템 선택은 **타일 격자**다. 섹션 안 정렬은 **팩 한정·클리어 보상 먼저**(`isPackBound`), 그다음 조건 진행률, id다. 타일에는 아이콘·이름·조건 한 줄(「진동 3/5」)만 두고, 획득 배지·티어 텍스트는 쓰지 않는다(티어는 아이콘 칩). 나머지 설명과 조합식은 상세 시트에 있고 **조합식은 기본으로 닫혀** 있다. 같은 재료를 쓰는 조합 목표 둘은 막지 않고 **「얽힘」**으로 알린다(`lib/entangle.ts`).
- 우측 패널의 **「목표」 탭**(`GoalsPanel`)은 `wanted` 전체(포기 포함)를 — 재료는 빼고 고른 것만 — 추적기와 같은 `GiftTile` 토글로 보여 주고, 무대 팩 타일·추적기와 `run.giftStatus` 한 곳을 공유한다(누르면 획득 ↔ 해제, 실패는 층을 떠날 때의 자동 실패만). 타일은 **길게 누르기(1초)·우클릭·모서리 ⓘ**로 기프트 상세 시트를 연다(`useLongPress`, `PlanContext.openGift`가 시트를 한 번만 호스팅).
- 패널 안에서 여는 시트는 `createPortal`로 `document.body`에 붙인다. 패널이 `@container`라 그 안의 `position: fixed`는 패널 기준이 된다.
- 앱은 **항상 런 화면**이다(단계 없음). `run.currentFloor`는 아직 결정하지 않은 첫 층(프런티어), `run.stageFloor`는 무대에 보이는 층이고, **건너뜀 = 지난 층에 방문 없음**(가짜 팩 id를 쓰지 않는다). 패널 열림·탭은 `ui` 슬라이스(기기 저장). 층을 떠날 때의 획득/실패 정리(`settle`)는 `PlanContext`의 `enter`/`next`가 한다. 무대의 입장·다음 층·돌아가기는 **당기기 제스처**(`usePullGesture`, 세로 72px)와 버튼이 같은 동작이고, **돌아가기(`leave`) = 방문 취소 + 그 팩 전용 기프트 상태 초기화**다. 1층을 처음 떠날 때 'got'으로 기록한 시작 기프트(관측·시작 기프트)는 `run.startGifts`에 남기고, **1층으로 돌아오면(입장 취소·건너뜀 취소) 그 기록도 취소한다**(`moveFrontier`). 무대 헤더에는 버튼이 없다 — 뒤로는 층 스트립(`setStageFloor`), 앞으로는 카드와 팩 영역이다.

## 에이전트와 스킬

작업 성격에 맞는 서브에이전트를 쓴다: `game-data-researcher`(규칙·데이터 출처 조사), `data-pipeline-engineer`(scripts·data), `route-algorithm-engineer`(src/core), `frontend-engineer`(src/app), `qa-reviewer`(푸시 전 리뷰).

게임 데이터나 루트 로직을 건드리기 전에 `md-domain` 스킬을 읽는다. 데이터 갱신은 `update-game-data`, 검증 실패는 `validate-data`, 보정 추가는 `add-curated-override`, 루트가 이상할 때는 `route-debug`, 배포는 `deploy`.

## 커밋

- 커밋 전 `npm run check`. 훅이 `git commit`/`git push`를 가로채 같은 검사를 돌린다.
- `public/data`가 바뀌면 생성물도 같은 커밋에 포함한다(CI가 재현성을 검사한다).
- 마일스톤 단위로 커밋하고 `docs/review/M{n}.md`에 리뷰용 요약을 남긴다.
