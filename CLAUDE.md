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
npm run data:import -- <폴더>   # 클라이언트에서 추출한 static-data를 data/raw에 넣기 (--write로 적용)
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
| `data/raw/derived/**` | 커뮤니티가 가공한 보조 원본 | 같다. 정적 데이터가 없는 인격을 채우는 데만 쓴다 |
| `data/curated/**` | 사람이 적는 보정·상수 | 모든 항목에 `_source` 근거를 남긴다 |
| `public/data/**` | 생성물 (커밋 대상) | 손으로 고치지 않는다. `data:build`로만 만든다. 시즌별 `md{n}/`과 공용 파일로 갈린다 |
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
- **같은 기프트는 한 런에 하나뿐이다.** 보유 중인 기프트는 다시 제안되지 않고, 조합은 재료를 소모한다. 그래서 두 조합이 같은 재료를 먹으면 **몫을 따로 확보해야** 한다: 요구사항은 `requirementKey`(기프트 + 먹는 조합)로 세고, 탐색은 한 기프트의 두 몫에 **서로 다른 팩**을 준다(복각 팩이 두 번째 몫을 주는 식). 두 번째 팩이 없으면 `ingredient-shared`로 미해결이고, 관측도 한 몫만 준다. 확보했더라도 **먼저 조합해 소모해야 두 번째가 다시 나온다** — 순서는 계획이 검사하지 못하므로 `shared-ingredient` 경고로 알린다.
- **탄환**(`Bullet`)은 인격 전용 키워드다(`IDENTITY_KEYWORDS` = 7키워드 + 탄환). 탄환 기프트·팩·시작 풀이 없으므로 `KEYWORDS`에 넣지 않고 `enums.identityOnlyKeywords`로 내보낸다. 부여가 아니라 **소모**라서 스킬 스크립트의 요구 토큰(`[necessary:Bullet:1]`)으로 도출하고, `dominantKeyword`는 탄환을 시작 키워드로 고르지 않는다.

## 코드 규칙

- **인격 데이터는 세 층으로 만든다**: 정적 데이터(OpenLethe) > 자동 백필(eldritchtools 파생 미러 + KR 스킬 원문) > 수기(`data/curated/identities.json`). 각 층은 위층에 없는 것만 채우고, **아래층이 위층을 가리면 `data:build`가 멈춘다**. 키워드만은 항상 KR 스킬 원문에서 도출한다 — 파생 미러는 179명 중 10명에서 덜 알기 때문에 교차검증용이다. 자세한 것은 `docs/research/data-sources.md`.
- **생성물은 시즌으로 갈린다**: 시즌은 기프트 풀을 더하지 않고 **교체**하므로 `meta`·`rules`·`gifts`·`packs`는 `public/data/md{n}/`에, 거던을 보지 않는 `enums`·`identities`는 루트에 공유로 둔다. `index.json`이 시즌 목록과 기본 시즌을 말하고 앱은 그것만 본다. **한 번에 한 시즌만 굽는다** — `data/raw/static`은 한 시즌의 스냅숏이라, 새 스냅숏이 오면 이전 시즌은 다시 구울 수 없고 **커밋된 채로 얼어 있다**. **층 범위는 `rules.floors` 한 곳에서** 오고(`data/curated/seasons/md{n}/rules.json`), 코드에 6·11을 박지 않는다 — core는 `indexes.fixedModeByFloor`, 앱은 `store.lastFloor`를 본다. `MAX_FLOOR_EVER`는 저장·공유 상태의 상한일 뿐이다. 반쯤 아는 시즌은 `meta.provisional`이고, **기본 시즌이 되지 않으며** 검증이 범용 풀 없음을 에러 대신 경고로 낮춘다.
- **거울 던전 데이터도 세 층이다**: 정적(OpenLethe) > 폴백(eldritchtools를 원본 모양으로 합성, `scripts/lib/derived-md.ts`) > 직접 추출(`npm run data:import`). OpenLethe의 MD 캡처는 얼어 있어 새 시즌이 오지 않으므로, 폴백이 팩·층·전용 기프트·조합·시작 풀을 메운다. **팩별 범용 기프트 풀만은 어디서도 못 얻는다** — 추측하지 않고 `data:validate`가 에러로 막는다. 시즌 선택은 `currentDungeonId`가 가장 큰 파일을 고르는 데이터 주도라, md8 파일이 어떤 경로로든 들어오면 자동으로 집힌다.
- **출처가 조용히 멈추는 것이 이 프로젝트의 주된 고장이다.** 검증은 「어느 출처든 아는데 우리가 안 내보내는 인격」을 에러로 잡는다(한 출처만 보면 둘 다 늦을 때 침묵한다). 파생 미러의 `meta.json` 시각으로 vendoring 복사본이 낡았는지도 경고한다.
- 게임 상수는 코드에 박지 않고 `data/curated/rules.json`에 둔다.
- 스키마는 `src/core/schema.ts`(Zod) 한 곳에서 정의하고 파이프라인·앱·테스트가 공유한다.
- UI 문자열은 `src/app/i18n/`에 두고 **한국어 우선**, 영어는 보조로 병기한다.
- 정적 파일 참조는 항상 `import.meta.env.BASE_URL`을 붙인다(GitHub Pages 예비 경로가 하위 경로라서).
- **시즌 전환은 푸터에서 한다**(`AppShell`의 데이터 버전 줄). 시즌이 하나뿐이면 지금처럼 이름만 적고 선택 컨트롤을 그리지 않는다. 시즌을 바꾸면 런을 버리고, 새 시즌이 **모르는 id의** 기프트·팩 설정만 빼며 **몇 개를 뺐는지 말한다**(`adoptSeason`). 시즌이 아는데 못 주는 기프트는 그대로 두고 플래너가 미해결로 설명한다. 공유 링크는 시즌을 `s`로 싣고, 없는 링크(`v` < 5)는 MD7이다.
- 게임 이미지는 저장소에 두지 않는다. 아이콘·팩 이미지는 플레이스홀더이고 `VITE_ASSET_BASE`가 있을 때만 외부에서 불러온다.
- 계획이 불가능한 요구는 조용히 버리지 않고 `unresolved`에 이유와 함께 남긴다.
- 팩 단위 선택(`preferredPacks`·`bannedPacks`·`pinnedPacks`)은 core 옵션이다. UI는 팩 충돌 그룹(`conflictGroups`)에서 팩째로 포함·포기를 고르고, 루트는 노선도(세그먼트 = 같은 창의 팩 묶음)로 그린다.
- 런 진행 상태(`currentFloor`·`ownedGifts`·`unobtainableGifts`, `WantedGift.ingredientsAsGoals`)도 core 옵션이다. 앱은 `run` 슬라이스(기기에만 저장, 공유 링크 제외)와 `fusionGoal`(공유 링크 포함)에서 `planInputFor`로 만든다. 지나간 층은 `FloorPlan.passed`로만 남고 그 층의 `pinnedPacks`가 방문한 팩이다.
- 덱은 비어 있지 않다: 첫 방문은 **LCB 수감자 12인**으로 시작하고(`lib/default-deck.ts`), 저장된 덱·공유 링크가 우선한다.
- 아이템 선택은 **타일 격자**다. 섹션은 **활성 / 기타** 둘뿐이고(「거의 활성」 없음), 섹션 안 정렬은 **팩 한정·클리어 보상 먼저**(`isPackBound`), 그다음 조건 진행률, id다. 타일에는 아이콘·이름·조건 한 줄(「진동 3/5」)만 두고, 획득 배지·티어 텍스트는 쓰지 않는다(티어는 아이콘 칩). 나머지 설명과 조합식은 상세 시트에 있고 **조합식은 기본으로 닫혀** 있다. 같은 재료를 쓰는 조합 목표 둘은 막지 않고 **「얽힘」**으로 알린다(`lib/entangle.ts`).
- 검색은 기프트·팩·인격 셋 다 `lib/hangul.ts`의 `matchesQuery`를 쓴다: 평소에는 부분 문자열, 질의가 **전부 초성**일 때만 초성 모드다(섞인 「진ㅎ」은 부분 문자열 그대로).
- **우선순위는 반드시/보통 둘뿐**이다(`Priority`). 「포기」는 상태가 아니라 **선택 해제**(`removeWanted`)다 — 미해결 카드·대안 탭의 포기 버튼도 선택에서 뺀다.
- **고른 목표가 정리하는 기프트는 고를 수 없다**(`lib/entangle.ts`의 `blockedGifts`): 잠그는 이유는 **포함** 하나뿐이다 — 목표의 재료 트리에 있으면 키워드가 달라도 잠근다(데스페라도 ⊃ 노이즈 섞인 무전기). 상위를 고르면 이미 골라 둔 재료는 선택에서 빠진다. 타일은 `data-block`으로 이유를 남기고 제목이 상대 기프트를 말한다. **재료가 겹치는 것은 잠그지 않는다** — 「얽힘」으로 알리고 판단은 플래너에 맡긴다.
- 선택 칩(`gift-chip`)은 아이콘·이름·✕만 갖는다(별·눈 버튼 없음). **이름을 누르면 상세 시트**가 열리고(타일로 이동하지 않는다), 칩을 **끌어서 관측 슬롯에 놓으면** 관측 지정이다(`useChipDrag`: 8px 넘게 움직여야 시작, 놓은 뒤 클릭 한 번 삼킴).
- **관측 지정은 아이템 탭의 슬롯**(`ObserveSlots`, `rules.giftObservation.max`개)에서 한다: 검색·필터 아래, 선택 칩 위. 빈 칸 「+」→ 관측 가능한 선택 기프트 목록 팝오버, 채운 칸은 아이콘·이름·✕. 찬 칸에 칩을 놓으면 교체. 상세 시트의 관측 버튼도 같은 `toggleObserved`를 부른다.
- 좌측 패널 탭은 **덱·아이템** 둘이다. 시작 키워드와 포함·포기한 팩 목록은 아이템 탭 하단의 `RouteOptions` 카드에 있다(옛 `leftTab: 'settings'`는 `sanitizeUi`가 `'gifts'`로 접는다).
- **헤더의 초기화(`resetAll`)가 유일한 초기화**다: 덱을 LCB 기본으로, 아이템·우선순위·조합 목표·옵션·런을 처음 상태로 되돌리고 `ui`·`lang`·`dark`는 남긴다. 「새 런」·「옵션 초기화」는 없다(무대 종료 카드는 제목만).
- 우측 패널의 **「목표」 탭**(`GoalsPanel`)은 `wanted` 전체를 — 재료는 빼고 고른 것만 — 추적기와 같은 `GiftTile` 토글로 보여 주고, 무대 팩 타일·추적기와 `run.giftStatus` 한 곳을 공유한다(누르면 획득 ↔ 해제, 실패는 층을 떠날 때의 자동 실패만). 타일은 **길게 누르기(1초)·우클릭·모서리 ⓘ**로 기프트 상세 시트를 연다(`useLongPress`, `PlanContext.openGift`).
- **난이도를 글자로 쓰지 않는다**(앱은 항상 Hard/EXTREME). 무대 헤더는 「N / 15」, 팩 시트의 층은 「4~5층 · 6~10층」, 노선도 띠에 라벨 없음. **층 스트립 열다섯 칸은 같은 모양**이다(1~5·6~10·11~15 띠 구분 없음, 팩 표시 점 없음 — 팩은 `title`·`aria-label`·`data-pack`에만). **무대에 선 칸만 강조색 테두리**이고, 아직 못 가는 칸은 흐리게가 아니라 `text-fg-3`이다(11px 글자는 `opacity`로 낮추면 대비가 4.5:1에 못 미친다). 노선도는 **범례·세그먼트 문구(「N층 고정」「추천 N」…)·관측 알약 없이** 채움·점선·굵기만으로 말하고, 무대·패널의 조작 안내문도 두지 않는다(법적 고지·데이터 버전은 유지).
- `GiftIcon`의 **네 모서리**가 각각 하나씩 말한다: 좌상 티어, 우상 획득/실패, 좌하 반드시, **우하 키워드 배지**. 배지는 7개 상태 키워드가 색(`--color-kw-*`), 참격·관통·타격은 한 가지 잉크(`--color-kw-attack`)에 모양으로 가른다(마름모·원·사각). **범용은 배지를 그리지 않는다.** **조건 판정은 바깥 링**(`ring-ok`/`ring-bad`/회색)이다. 팔레트에서 색조를 쓰는 곳은 이 둘과 **`accent` 하나**뿐이고, accent는 **무대에 선 층 칸 한 곳**에만 쓴다(M29에서 무대 카드의 accent는 뺐다). 지나간 것·확실성은 그대로 회색·채움·점선이 맡는다.
- **무대의 팩 카드는 모두 같다**(128px): 루트 팩도 「넘기기」 점선 카드도 같은 모양이고, 계획이 고른 팩은 `enterablePacks`의 정렬로 맨 앞에 설 뿐이다. 카드에 **배지를 두지 않는다** — 「추천」도 팩 상태(「포함 · N층」…)도 없고, 팩의 사정은 이름을 눌러 여는 팩 시트가 말한다. 입장한 팩 영역에도 「N층에 입장」을 적지 않는다(층수는 무대 헤더가 말한다).
- **우측 「전체 루트」는 팩의 흐름만 말한다**: 노선도 블록에는 팩 초상·이름만 두고 **기프트 아이콘을 두지 않으며**(무엇이 나오는지는 팩 시트), **조건 판정 카드도 없다**(판정은 아이템 타일의 링과 기프트 상세 시트가 말한다). 노선도 머리의 `start-cell`은 **두 줄**이다 — 위 `start-line`(시작 기프트 또는 「시작 {키워드}」), 아래 `observed-line`(「관측」 + 관측 타일). 시작과 관측은 서로 다른 결정이라 한 줄에 섞지 않는다.
- 무대의 「다른 팩」 목록은 팩 이름 옆에 **그 팩의 전용 기프트 아이콘**(최대 5 + 「+n」, 원하는 것은 링)을 둔다(`other-pack-gifts`).
- 패널 안에서 여는 시트는 `createPortal`로 `document.body`에 붙인다. 패널이 `@container`라 그 안의 `position: fixed`는 패널 기준이 된다.
- **기프트 상세 시트는 `PlanProvider`가 유일하게 호스팅한다** — 아이템 탭도 자기 시트를 두지 않고 `usePlan().openGift`를 부른다. 패널 안에 호스팅하면 모바일에서 패널이 닫힐 때 시트가 함께 언마운트된다.
- **떠 있는 레이어는 최상위 하나만 반응한다**: `useDismiss`는 모듈 스택을 두고 맨 위 레이어에만 Escape·바깥 포인터를 넘긴다. 리스너가 전부 `document`에 붙는데 시트는 `document.body`로 포털되므로, 스택이 없으면 시트 안의 누름이 그 아래 모든 레이어에게 「바깥」으로 읽힌다. 시트의 Escape는 `DetailSurface`가 직접 처리한다(전파를 멈추면 네이티브 이벤트도 멈춰 document 리스너에 닿지 않는다).
- z 사다리: 헤더 30 · 모바일 패널 페이지 40 · 시트 백드롭 50 · 시트 60 · 칩 드래그 고스트 70.
- **모바일(1024px 미만)에서 패널은 각각 전체화면 페이지**다(`data-testid="page-{side}"`, `document.body`로 포털). 다이얼로그가 아니라 페이지라서 백드롭도 `aria-modal`도 없고 바깥 누름·Escape로 닫히지 않는다 — 그동안 셸은 `inert`다. 닫기는 상단 바의 ← 또는 기기 뒤로가기이고, 둘 다 `usePageHistory`가 가진 히스토리 엔트리 하나를 지난다(시트도 자기 엔트리를 쌓으므로 뒤로가기 한 번은 시트만 닫는다). `pushState`는 URL을 쓰지 않는다 — 공유 링크 해시(`#s=`)와 GitHub Pages 하위 경로를 건드리면 안 된다.
- 앱은 **항상 런 화면**이다(단계 없음). `run.currentFloor`는 아직 결정하지 않은 첫 층(프런티어), `run.stageFloor`는 무대에 보이는 층이고, **건너뜀 = 지난 층에 방문 없음**(가짜 팩 id를 쓰지 않는다). 데스크톱 패널 열림·폭·탭은 `ui` 슬라이스(기기 저장)이고, 모바일 페이지 열림은 `AppShell`의 로컬 상태라 저장하지 않는다(한 번에 한쪽만). 층을 떠날 때의 획득/실패 정리(`settle`)는 `PlanContext`의 `enter`/`next`가 한다. 무대의 입장·다음 층·돌아가기는 **당기기 제스처**(`usePullGesture`, 세로 72px)와 버튼이 같은 동작이고, **돌아가기(`leave`) = 방문 취소 + 그 팩 전용 기프트 상태 초기화**다. 1층을 처음 떠날 때 'got'으로 기록한 시작 기프트(관측·시작 기프트)는 `run.startGifts`에 남기고, **1층으로 돌아오면(입장 취소·건너뜀 취소) 그 기록도 취소한다**(`moveFrontier`). 무대 헤더에는 버튼이 없다 — 뒤로는 층 스트립(`setStageFloor`), 앞으로는 카드와 팩 영역이다.

## 에이전트와 스킬

작업 성격에 맞는 서브에이전트를 쓴다: `game-data-researcher`(규칙·데이터 출처 조사), `data-pipeline-engineer`(scripts·data), `route-algorithm-engineer`(src/core), `frontend-engineer`(src/app), `qa-reviewer`(푸시 전 리뷰).

루트 계산의 단계별 설명은 `docs/route-algorithm.md`에 있다(사용자용, 한국어). 게임 데이터나 루트 로직을 건드리기 전에 `md-domain` 스킬을 읽는다. 데이터 갱신은 `update-game-data`, 검증 실패는 `validate-data`, 보정 추가는 `add-curated-override`, 루트가 이상할 때는 `route-debug`, 배포는 `deploy`.

## 커밋

- 커밋 전 `npm run check`. 훅이 `git commit`/`git push`를 가로채 같은 검사를 돌린다.
- `public/data`가 바뀌면 생성물도 같은 커밋에 포함한다(CI가 재현성을 검사한다).
- 마일스톤 단위로 커밋하고 `docs/review/M{n}.md`에 리뷰용 요약을 남긴다.
