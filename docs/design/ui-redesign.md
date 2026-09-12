# 웹 UI 리디자인 — 단계형 흐름, 회색 전용 팔레트

디자인 캔버스: https://claude.ai/code/artifact/661ce48e-49f0-479a-b3b0-b286320c2736
(페이지: 「화면」 12장 · 「상태」 8장 · 「토큰 · 컴포넌트」 2장 · 「1단계 스케치」 3장)

이 문서는 캔버스를 코드(`src/app`)로 옮기는 세션을 위한 명세다. **M7에서 구현됨**(`docs/review/M7.md`). 구현과 다른 점: E.G.O 슬롯 보류, `upgradeOf`는 기프트 최상위 필드, 서체는 시스템 한글 폰트만(외부 폰트 없음). `src/core`·`public/data`는 이 디자인과 무관하게 유지하되, 아래 「구현 전제」에 적힌 몇 가지는 디자인이 요구하는 코어·데이터 변경이다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 방향 | 1단계 스케치 A(정제된 stone)를 채택하되 **색은 회색 계열만** 쓴다. amber 포함 유채색 강조 없음 |
| 구분 수단 | 획득 신뢰도·상태는 색이 아니라 **채움 · 선 종류 · 명도 · 아이콘 · 굵기**로 구분. 유일한 예외는 조건 판정 — 기프트 아이콘 테두리 **초록(충족)/빨강(미충족)/점선(판정 불가)**(M9) |
| 화면 구조 | 3패널 동시 표시를 버리고 **단계형**: 1 덱 → 2 기프트 → 3 루트. 데스크톱도 한 번에 한 단계 |
| 이미지 | 저장소에 이미지 없음(재배포 회피). 기프트 아이콘·팩 이미지는 **플레이스홀더 자리**를 두고, `VITE_ASSET_BASE`가 있을 때만 외부 이미지를 불러온다(M9). 인격 초상은 자리 없음 |
| 문구 | 설명 문장 최소화. 본문 13px, 보조 11px. 긴 설명은 툴팁·보조문구 |
| 참고 | 루트 시간표의 「고정 블록 vs 유동 구간」 표현만 캘린더 UI를 참고 |

## 화면 흐름

### 공통 셸

- 헤더 56px(모바일 52px): 제목 「거울 던전 루트」 + 아이콘 버튼 3개(공유·언어·테마). 라벨 없음, 툴팁.
- 스텝퍼: 데스크톱은 헤더 아래 pill 3개(`1 덱 · 12/12` → `2 기프트 · 5` → `3 루트`), 모바일은 하단 고정 바 56px(3탭). 현재 단계 ink 채움, 완료 단계 체크, 미완료는 fg-3. 덱이 비면 2·3단계 비활성.
- 요약 스트립: 스텝퍼 옆(모바일은 위) 칩 한 줄. 2단계 위엔 덱 요약(`출격 7 · 화상 7 · 진동 4 …`), 3단계 위엔 덱 2개 + 기프트 요약(`기프트 5 · 확정 2 · 가능 1 · 조합 2`).
- 콘텐츠 최대 폭 1120px 중앙 정렬. 데스크톱 하단 우측에 「다음 단계」 primary 버튼, 좌측에 「이전」 ghost.

### 1 덱

- 툴바: **전체 인격 검색**(183명 대상, 이름·소속·키워드) · `출격 7/7` 카운터 · 「코드 가져오기」.
- 전체 검색 드롭다운: 수감자별 한 줄(수감자 · 인격명 · 키워드 · 소속 칩). 고르면 그 수감자 칸에 들어간다.
- 카드 12장(데스크톱 4열, 모바일 1열, 높이 124px): 수감자명(11px) · **출격/대기 토글**(체크박스) · 인격명 + `n성` · 키워드 카운트 칩 · **E.G.O 슬롯**(보류 — M7에서는 그리지 않음).
  - 출격 카드: surface + line-strong + shadow. 대기 카드: surface-2 + line.
  - 출격이 7명이면 나머지 카드의 토글 비활성(툴팁 「최대 7명」).
  - E.G.O 슬롯: 비어 있으면 점선 「E.G.O ▾」, 고르면 「E.G.O · 이름」. 키워드 판정이 바뀌면 옆에 델타 텍스트(`+특수 화상`).
  - 카드 클릭 → 그 수감자 인격만 검색하는 팝오버(모바일 보드 참고).
- 하단 한 줄: 키워드 카운트 칩(출격 기준, 대기 포함 값은 툴팁).

### 2 기프트

- 툴바: 검색 · 필터 칩(키워드 · 등급 · 획득 · **죄악** · **가격**) · 「선택 N」 트레이(선택 칩, ×로 해제).
- 목록은 **덱 기준 우선순위** 섹션 3개(고정 순서):
  1. 「지금 덱으로 활성」 — 조건 충족. 행 오른쪽에 `have/need` 진행 막대.
  2. 「거의 활성」 — 미충족이지만 `have/need ≥ 0.6`. 부족분 텍스트(`진동 +1`).
  3. 「기타」 — 조건 없음 · 나머지. 기본 접힘, 개수만.
- 행 44px: 체크 · 이름 · `T4` · 키워드 칩 · **획득 배지** · (Hard 배지) · 진행. 펼치면 효과 1줄 + 재료 칩.
- **조합 계승**: 하위 기프트(예: 요리 비법 전서)는 독립 행이 아니라 상위 기프트(진혼) 아래 **서브행**(`→ 요리 비법 전서 · T3 · 획득 배지 · Hard`)으로만 보인다. 서브행에도 체크박스가 있어 하위만 단독으로 고를 수 있다(M8). 상위를 선택하면 서브행 체크가 잠기고 「포함」 배지.
- 긴 목록: 섹션 헤더 sticky, 가상화(행 높이 고정 44px), 헤더에 `446개 중 · 41~53 표시`.

### 3 루트

- 옵션 바(카드 1줄): **층 밴드 선택기** · **Hard 단방향 스위치** · 관측 최대(세그먼트 0~3) · 시작 키워드 칩 · 「옵션 초기화」.
  - 층 밴드 선택기: 1~15 셀 스트립. 1~5 / 6~10(surface-2) / 11~15(빗금 = 관측 불가) 밴드 배경, 위에 밴드 라벨. 선택 범위는 ink 채움.
  - Hard 스위치: 전환 전 「→ Hard로 전환」 secondary 버튼. 전환 후 ink 채움 「lock Hard · 되돌릴 수 없음」, **되돌림 버튼 없음**(옵션 초기화로만). 6층 이상 선택 시 자동으로 잠금 상태가 되고 info 배너 1줄.
- 요약: `필요 팩 2 · 확보 4/5`(mono 22px) + 근사 결과 배지(해당 시) + 「텍스트 복사」. 별빛 수치는 어디에도 표시하지 않는다(인게임에서 보인다).
- **대안 루트 탭**(M9): 본 계획에 팩 충돌이 있으면 요약 아래에 `role=tablist` — 「전부 · 4/5」 + 「{아이콘} {기프트} 제외 · 4/4」…(최대 4). 탭을 고르면 시간표·조건·미해결·복사가 그 계획을 쓴다. 변형 탭에는 「이 기프트 빼고 확정」 ghost 버튼.
- **관측**(M9): 「관측 최대」 옵션 없음. 2단계 트레이 칩의 눈 토글로 지정(≤3, 관측 불가 기프트는 비활성 + 사유 툴팁). 시간표 시작 칸에 관측 기프트 타일(아이콘 32 + 이름 + 「지정」/「추천」 태그, 툴팁에 「{팩} 안 가도 됨」). 추천 타일을 누르면 지정으로.
- **시간표**(데스크톱): 열 = 시작 + 계획 범위 안의 층(균등) + 범위 밖 층 전부를 합친 **44px 열 하나**(「범위 밖」, 헤더 `6~`), 행 = 팩 레인 + 합성 레인. 15층 계획이면 범위 밖 열이 없다.
  - **고정 블록**: ink 채움. 헤더 = 팩 이미지 28 + 팩명(2줄 클램프), 둘째 줄 「고정」, 셋째 줄 픽업 타일(아이콘 44 + 이름 2줄, 판정 테두리). 전용 픽업만 그린다 — 범용은 어느 팩에서나 나오므로 표시하지 않는다.
  - **유동 구간 블록**: 점선 테두리, 가능한 층 전체에 걸침. 추천 층 구간은 surface-2 배경 + 굵은 밑줄. `4~5층 중 한 층 · 추천 4`.
  - 블록은 내용에 맞춰 자란다(`overflow-hidden`·`truncate` 없음). **호버/포커스한 블록의 층은 2.2fr로 넓어진다**(`grid-template-columns` 전환 160ms, reduced-motion이면 즉시). 모바일 행은 `minmax(58px, auto)`.
  - 연속된 자유 층(어떤 창에도 안 걸치는)은 셀 하나로 합쳐 「자유 · 6~10층」. 시작 열엔 시작 기프트 작은 블록, 없으면 시작 키워드. 합성 레인은 점선 회색 블록(`shop 합성 → 진혼`). 모바일도 자유 층 묶음은 40px 행 하나.
  - 범례는 「이 층 고정」「이 중 한 층 (진한 칸 = 추천)」 **두 항목만**. 합성 레인 없음.
- 시간표(모바일 400px): 행 = 층, 열 = 레인 2개. 유동 구간은 세로로 걸치고 추천 층은 좌측 굵은 선. 가로 스크롤 없음.
- 아래 카드: 조건 판정(기프트 아이콘 44 타일 + 이름 + `7/5`; 판정은 테두리 색, 문장은 툴팁·sr-only) · 참고(루트에 영향 주는 경고만; 조건 미충족·범용·합성 칸 경고는 표시하지 않음) · **미해결**(행마다 아이콘 32; 팩 충돌 행에는 「대안 루트 보기」). 조합 카드·범용 드랍 카드는 없다 — 조합법은 인게임에서 보이고 범용은 어느 팩이든 상관없다.(fg 1.5px 테두리 + alert 아이콘, 항목마다 이유 칩 + 사유 1줄; 여러 항목이 같은 조치를 원하면 카드 헤더에 버튼 한 개, 항목 고유 조치만 행에). 모바일은 미해결을 요약 바로 아래에 둔다.

### 상태

| 상태 | 처리 |
|---|---|
| 로딩 | 1단계 셸 + 스켈레톤 카드, 하단 `게임 데이터를 불러오는 중 · 1.2 MB` |
| 로드 실패 | 중앙 strong 카드: 제목 · 원인 1줄 · 「다시 시도」 primary · 「오프라인 데이터로」 |
| 덱 비어 있음 | 12칸 점선 「+ 인격 선택」, 카운터 `0/7`, 2·3단계 비활성. 2단계 진입 시 「덱이 비어 있습니다 → 1 덱으로」 |
| 기프트 일치 없음 | 검색어·활성 필터를 보여 주고 「필터 초기화」 |
| 기프트 미선택 | 3단계에 옵션 바만 두고 「기프트를 고르면 루트가 나옵니다 → 2 기프트로」 |
| 미해결 있음 | 미해결 카드(이유 칩: 층 범위 밖 · 팩 충돌 · Hard 전용 · 재료 미해결 · 획득 불가) + 조치 버튼 |
| 근사 결과(탐색 한도) | 요약에 「근사 결과」 배지 + 시간표 위 warning 배너 1줄 |
| 긴 목록 | sticky 헤더, 가상화, 표시 범위 카운트 |

## 도메인 규칙 → 시각 처리

| 규칙 | 표현 |
|---|---|
| 범용은 「나올 수 있음」, 확정 아님 | `가능` 배지 = 점선 테두리 + 물결 아이콘, fg-2 글자. `확정` 배지 = ink 채움 + 체크. 범용 드랍 카드는 점선 테두리 + 「확정 아님」 |
| 계획 불가는 숨기지 않음 | 미해결 카드는 접히지 않는 strong 카드, 이유 칩 + 사유 + 조치 |
| Hard는 sticky | 단방향 스위치. 잠금 상태에 되돌림 컨트롤 없음 |
| 층 구간 | 밴드 선택기와 시간표 머리글이 같은 밴드 배경(1~5 / 6~10 surface-2 / 11~15 빗금) |
| 고정 층 vs 유동 구간 | ink 채움 블록 vs 점선 다중 열 블록 + 추천 층 강조 |
| 조합 계승 | 하위 기프트(`upgradeOf`가 있는 것)는 상위의 서브행. 상위 선택 시 「포함」 |
| 조건 판정 기준 | 진행 막대 `have/need`, 섹션 자체가 우선순위 |

## 토큰 (Tailwind 4 `@theme`)

`src/index.css`를 아래로 교체한다. 키워드별 유채색 토큰(`--color-kw-*`)은 삭제하고 키워드 칩은 회색 `chip`으로 통일한다(`ui.tsx`의 하드코딩 hex도 제거).

```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* 회색 전용 팔레트 — 유채색 없음 */
  --color-bg: #f7f6f4;         --color-surface: #ffffff;    --color-surface-2: #f0eeeb;  --color-surface-3: #e8e5e1;
  --color-line: #e3e0dc;       --color-line-strong: #c4beb7;
  --color-fg: #1c1917;         --color-fg-2: #57534e;       --color-fg-3: #6f6963;
  --color-ink: #292524;        --color-ink-fg: #ffffff;     /* 확정 배지 · primary 버튼 · 고정 블록 */
  --color-ok: #2f8f5b;         --color-bad: #c9403a;        /* M9: 판정 테두리에만 쓰는 유채색 2개 */

  --font-sans: 'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  --text-xs: 11px;  --text-xs--line-height: 1.4;
  --text-sm: 13px;  --text-sm--line-height: 1.45;
  --text-base: 15px; --text-lg: 18px; --text-xl: 22px;

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px;
  --shadow-card: 0 1px 2px rgb(28 25 23 / .06), 0 1px 1px rgb(28 25 23 / .04);
  --shadow-pop: 0 8px 24px rgb(28 25 23 / .14), 0 1px 2px rgb(28 25 23 / .08);
}
.dark {
  --color-bg: #131211;         --color-surface: #1c1a18;    --color-surface-2: #252220;  --color-surface-3: #2e2a27;
  --color-line: #332f2b;       --color-line-strong: #544e48;
  --color-fg: #ece8e3;         --color-fg-2: #b8b1a9;       --color-fg-3: #948d85;
  --color-ink: #e7e2dc;        --color-ink-fg: #1c1917;
  --color-ok: #4cc38a;         --color-bad: #f0665e;
  --shadow-card: none;         --shadow-pop: 0 8px 24px rgb(0 0 0 / .5);
}
```

- 대비(측정): 라이트 fg-3/surface-2 4.68:1, 다크 fg-3/surface-2 4.82:1. fg-3/surface-3는 4.3:1이므로 **surface-3 위에는 텍스트를 두지 않는다**(스켈레톤·진행 막대 트랙 전용).
- 빗금(EXTREME · 관측 불가): `repeating-linear-gradient(135deg, transparent 0 6px, var(--color-line) 6px 7px)`.
- spacing 4/8/12/16/24/32, 포커스 링 `outline: 2px solid var(--color-fg-2); outline-offset: 2px`.
- 웹폰트: M7에서 Pretendard 선언을 지우고 시스템 한글 폰트(Apple SD Gothic Neo / Malgun Gothic)만 쓴다. 외부 폰트 요청 없음.

## 컴포넌트

| 컴포넌트 | 변형 · 상태 | 비고 / 사용하는 문구 키 |
|---|---|---|
| `Button` | primary · secondary · ghost · danger · disabled · icon-only | h 32, radius sm. 모바일 히트 44 |
| `Badge` (획득) | `sure` 확정 · `maybe` 가능 · `fuse` 조합 · `start` 시작 · `hard` Hard · `approx` 근사 결과 · `alert` | 색 없이 채움/점선/아이콘 |
| `Chip` | 기본 · on · 카운트(`화상 7`) · 제거 가능(선택 트레이) | 키워드 칩도 이것 |
| `FilterChip` | off · on(라벨에 값 병기) | `filterKeyword` … + 새 키 `filterSin`, `filterPrice` |
| `Input` | search · value · 팝오버 내 소형(h 32) | `deckSearchPlaceholder` → 전체 검색 문구로 교체 |
| `Checkbox` | on · off · disabled | 출격 토글, 기프트 선택 |
| `Stepper` | desktop pill · mobile bottom bar · done/current/todo/disabled | `tabDeck` `tabGifts` `tabRoute` |
| `SummaryStrip` | 칩 나열 | |
| `GiftIcon` | 20 · 32 · 44 · 이름 표시 · 판정 테두리 met/unmet/unknown | M9. 플레이스홀더 + `VITE_ASSET_BASE` 이미지. `condMet` `condUnmet` `giftUnjudgeable` |
| `PackImage` | 28 · 40 | M9. 시간표 블록 헤더 |
| `ObservedTile` | 지정 · 추천 · 클릭 가능 | M9. `routeObservedPinned` `routeObservedRecommended` `routeObservedFrees` |
| `VariantTabs` | 전부 · 제외 탭 · 확정 버튼 | M9. `routeVariants` `routeVariantWithout` `routeVariantConfirm` |
| `HardSwitch` | before(버튼) · locked(잠금) | 새 키 `optionHardSwitch` / `optionHardLocked` |
| `FloorBandPicker` | 1~15, 밴드 3개, 선택 범위 | `optionFloors` |
| `Timetable` | desktop(열=층, 호버 확장) · mobile(행=층) · 블록 fixed/window · 시작 칸(시작 기프트·관측) · 자유 · 범위 밖 · 범례 2개 | 새 키 `routeFixedFloor`, `routeWindow`, `routeRecommended`, `routeOutOfRange`, `routeFree` |
| `Card` | 기본 · dashed(범용 드랍) · strong(미해결·에러) | |
| `Notice` | info · warning(근사 결과) | `routeWarnings`의 `search-capped`는 배너로 분리 |
| `UnresolvedCard` | 이유 칩 6종 + 조치 버튼 | `UnresolvedReason` 라벨 키 신설 |
| `Toast` | 성공 | `shared`, `routeCopied` |
| `DeckCard` | deployed · reserve · empty · 토글 disabled | `deckDeployed` `deckReserve` `deckEmptySlot` |
| `EgoSlot` | empty · selected · +delta | **이번 라운드 보류**(E.G.O 데이터 없음). 새 키 `deckEgo`, `deckEgoDelta` |
| `ConditionProgress` | met · unmet · n/a | `conditionMet` `conditionUnmet` |
| `GiftRow` | 기본 · 펼침 · 서브행(계승) · 선택 | 새 키 `giftIncluded`(포함), `giftSubOf` |
| `Skeleton` | 카드 · 줄 | `loading` |
| `Popover` | 전체 검색 결과 · 수감자별 검색 | |

## 새 문구 키 초안 (ko / en)

| 키 | ko | en |
|---|---|---|
| `appTitleShort` | 거울 던전 루트 | Mirror Dungeon Route |
| `deckSearchAll` | 전체 인격 검색 · 이름 · 소속 · 키워드 | Search all identities · name · faction · keyword |
| `deckDeployedCount` | 출격 {n}/7 | Deployed {n}/7 |
| `deckDeployedFull` | 출격은 최대 7명입니다 | Up to 7 can be deployed |
| `deckEgo` (보류) | E.G.O | E.G.O |
| `deckEgoNone` (보류) | E.G.O 선택 | Choose E.G.O |
| `deckEgoDelta` (보류) | +특수 {keyword} | +special {keyword} |
| `deckEmptyHint` | 인격을 고르면 키워드 합계가 여기에 나옵니다 | Pick identities to see keyword totals |
| `giftsActive` | 지금 덱으로 활성 | Active with this deck |
| `giftsNear` | 거의 활성 | Almost active |
| `giftsOther` | 기타 | Others |
| `giftLack` | {keyword} +{n} | {keyword} +{n} |
| `giftIncluded` | 포함 | Included |
| `giftSubOf` | {parent} 재료 · 상위 선택 시 포함 | Ingredient of {parent} · included when it is chosen |
| `filterSin` | 죄악 | Sin |
| `filterPrice` | 가격 | Price |
| `giftsDeckEmpty` | 덱이 비어 있습니다 | The deck is empty |
| `giftsShowing` | {total}개 중 · {from}~{to} 표시 | {from}–{to} of {total} |
| `filterReset` | 필터 초기화 | Reset filters |
| `optionFloorRange` | 층 범위 | Floors |
| `optionBandHard` | 1~5 · Hard | 1–5 · Hard |
| `optionBandParallel` | 6~10 · 평행중첩 | 6–10 · Parallel |
| `optionBandExtreme` | 11~15 · EXTREME | 11–15 · EXTREME |
| `optionHardSwitch` | Hard로 전환 | Switch to Hard |
| `optionHardLocked` | Hard · 되돌릴 수 없음 | Hard · cannot be undone |
| `optionReset` | 옵션 초기화 | Reset options |
| `routeApprox` | 근사 결과 | Near-best |
| `routeFixedFloor` | 고정 | Fixed |
| `routeWindow` | {from}~{to}층 중 한 층 · 추천 {pick} | Any one of floors {from}–{to} · suggested {pick} |
| `routeFree` | 자유 | Free |
| `routeOutOfRange` | 범위 밖 | Out of range |
| `routeFreeRange` | 자유 · {from}~{to}층 | Free · {from}–{to} |
| `unresolvedNoPack` | 층 범위 밖 | No pack in range |
| `unresolvedConflict` | 팩 충돌 | Pack conflict |
| `unresolvedHardOnly` | Hard 전용 | Hard only |
| `unresolvedIngredient` | 재료 미해결 | Ingredient unresolved |
| `unresolvedNotObtainable` | 획득 불가 | Not obtainable |
| `actionExtendFloors` | {n}층까지 계획 | Plan to floor {n} |
| `actionSwitchHard` | Hard로 전환 | Switch to Hard |
| `loadingData` | 게임 데이터를 불러오는 중 | Loading game data |

## 구현 전제 (코어·데이터·상태)

이 디자인이 그대로 동작하려면 UI 밖에서도 다음이 필요하다. 각 항목은 별도 작업으로 나눌 수 있다.

1. **출격 인원 최대 7, 순서 유지** — `src/core/deck.ts` `DEPLOYED_SLOTS = 6` 고정과 `store.ts`의 수감자 순 정렬(앞 6명 출격)을 `options.deployed`(id 목록, 최대 7) 기반으로 바꾼다. 검증: 7명 초과 시 거부, `deployed`가 덱에 없는 id를 포함하면 무시.
2. **E.G.O 데이터**(**보류** — 사용자 결정으로 M7 범위에서 제외) — 저장소에 E.G.O 데이터가 없다. E.G.O 목록(인격별 장착 가능 E.G.O 이름)과 「E.G.O가 바꾸는 키워드 판정」 보정표를 `data/curated/ego-keywords.json`(`_source` 필수)에 두고, `deck.ts` `conditionCount`가 `identity.keywords[kw].special`과 조건의 `includesSpecial`을 실제로 반영하게 한다. 캔버스의 E.G.O 이름·「+특수 화상」은 **샘플**이다.
3. **유동 구간(`window`)** — `search.ts`의 `Candidate.slots`는 결과에서 버려진다. `FloorPlan`에 `window: {from, to} | null`을 추가해 같은 팩이 놓일 수 있는 연속 층 범위를 남긴다(Hard 팩 45개는 인접 2층, 평행중첩 팩 45개는 6~10 전체). M8부터는 「다른 필수 팩이 모두 다른 층에 들어갈 수 있는가」를 이분 매칭으로 따지는 **공동 가능성**이라, 서로 층을 바꿀 수 있는 두 팩은 둘 다 창을 가진다. 고정 블록은 `window == null` 또는 `from == to`.
4. **조합 계승 파생** — 빌드 시 `gifts.json`에 기프트 최상위 필드 `upgradeOf: number | null`을 추가(범용 재료도 대상이라 `fusion` 안이 아님): 어떤 결과 기프트의 유일한 재료이면서 같은 키워드·낮은 등급이면 그 결과의 id(현재 76쌍, 3/4재료 이중 레시피 8쌍 포함). UI는 `upgradeOf`가 있는 기프트를 상위 행의 서브행으로 그린다.
5. **조건 정렬** — `evaluateConditions` 결과로 `satisfied` → `have/need` 비율 순 정렬 헬퍼를 `src/app`에 둔다(코어 변경 없음). `fullResonance`·`unparsed`는 「판정 불가」로 표시.
6. **전체 인격 검색** — `DeckPanel` 검색을 수감자 한정과 전체 두 경로로. 결과는 수감자별 그룹.
7. **가상화** — 기프트 목록 상위 200개 슬라이스 대신 고정 높이 44px 가상 목록.
8. **죄악·가격 필터** — 스키마에 이미 있는 `gift.sin`, `gift.price`를 필터 칩으로.
9. **근사 결과 분리** — `warnings` 중 `search-capped`는 배너 + 요약 배지, 나머지는 기존 목록.
10. **미해결 조치 버튼** — 이유별 조치: `no-pack-in-range` → 그 기프트의 팩이 처음 나오는 층이 속한 밴드 끝(5/10/15)까지 확장(5층 이하면 Hard를 강제하지 않음), `pack-conflict` → 다음 밴드까지 확장, 둘 다 관측 허용 +1, `hard-only` → Hard 전환. 조치는 옵션을 바꾸고 재계산할 뿐 코어 변경 없음(`src/app/lib/unresolved-actions.ts`).

## 검증 (캔버스 기준)

- 모바일 보드 8장 모두 400px 뷰포트에서 요소 최대 우측 좌표 ≤ 400(가로 스크롤 0). 데스크톱 12장 1440px 클리핑 없음.
- 텍스트 대비 라이트/다크 모두 4.5:1 이상(위 토큰 표).
- 캔버스 각 보드는 PNG/PDF로 내보낼 수 있다.

## M9 추가 규칙 (아이콘 · 관측 · 대안 루트)

| 곳 | 기프트 아이콘 | 팩 이미지 |
|---|---|---|
| 시간표 블록 픽업 타일 | 44 + 이름 2줄 | 블록 헤더 28 |
| 시간표 시작 칸(시작 기프트·관측) | 32 + 이름 | — |
| 조건 판정 카드 | 44 + 이름 + `have/need` | — |
| 미해결 카드 행 | 32 | — |
| 대안 루트 탭 | 20 | — |
| 2단계 기프트 행 / 서브행 / 트레이 칩 | 32 / 20 / 20 | — |

- 아이콘 플레이스홀더: `bg-surface-3` 정사각, lucide `Gem` 40%, 우하단 `T{n}`(32 이상). 이미지는 `{VITE_ASSET_BASE}/gifts/{icon}.png`, 실패 시 플레이스홀더로 복귀. 팩은 `packs/{sprite}.png`.
- 판정 테두리: 충족 `border-2 border-ok`, 미충족 `border-2 border-bad`, 판정 불가 `border-2 border-dashed border-line-strong`, 조건 없음 `border border-line`. 접근성 이름은 「충족 · {이름}」 꼴.
- 문구 키(M9 추가): `acqClear` 클리어 보상 · `acqChance` 확률 보상 · `unresolvedChance` · `actionObserveGift` · `actionReleaseObservations` · `routeObservedPinned/Recommended/Frees/Rescue/Toggle` · `routeVariants` · `routeVariantAll/Without/Confirm/See` · `giftsObserve` · `giftsObserveHint` · `giftsObserveNotAllowed` · `giftsObserveFull`. 삭제: `optionObservation`, `routeStarlight`, `routeUnverified`, `routeFuse*`, `routeFusions`, `routeFusion*`, `routeGeneral*`, `legendSure/Maybe/Eye/Hatch`, `acqMaybeLong`, `actionObserveMore`, `routeObservationImpossible`.

## M10 추가 규칙 (15층 고정 · 우선순위 · 고정 격자)

- **옵션 바**: 시작 키워드 select + 「항상 1~15층 · Hard로 계획합니다」 + 「옵션 초기화」뿐. 층 밴드 선택기·Hard 스위치·자동 잠금 배너는 없다. 옛 링크·저장값의 층 범위는 `sanitizeOptions`가 15층·Hard로 덮어쓴다.
- **우선순위 3단계**: 보통(기본) / 반드시(`Star` 채움, 칩 `border-ink`, 아이콘 좌상단 별 배지 `data-must`) / 포기(`Ban`, 칩 `opacity-60 line-through`). 2단계 트레이 칩의 눈 토글 옆 버튼이 보통 → 반드시 → 포기 → 보통으로 순환한다(`aria-label` 「{이름} 우선순위: {값}」). 포기는 선택을 유지한 채 계획에서만 빠진다.
- **미해결 카드**: 헤더 = 제목·건수 + 공유 조치 버튼 + 「대안 루트 보기」 1개. 행 = 아이콘 32 · 이름 · 이유 칩 · (반드시 배지) · 사유 1줄 · 우측 아이콘 버튼 `Star`(반드시, `aria-pressed`) `Ban`(포기) `Eye`(관측 지정, 적격일 때만). 카드 아래 `<details>` 「포기한 기프트 n」 — 아이콘 20 + 취소선 이름 + 「되돌리기」. 요약에 「포기 n」. 대안 탭의 확정 버튼은 「이 기프트 포기」.
- **시간표 격자**: 데스크톱 열 `84px repeat(15, minmax(0, 1fr))`, 레인 행 132px 고정. 모바일 열 `56px repeat(n, minmax(0, 1fr))`, 층 행 64px, 자유 병합 행 40px, 시작 행 auto. 층 라벨과 배경 밴드는 본문 그리드 안의 셀이다(오버레이 없음). 호버해도 격자는 움직이지 않는다.
- **블록**: `role=button` `aria-haspopup=dialog`, `overflow-hidden`. 데스크톱 = 팩 이미지 24 + 이름 1줄 / 「고정」·「4~5 · 추천 4」 / 아이콘 32 랩. 모바일 = 팩 이미지 32 + (이름·구간) + 아이콘 우측 정렬. 레인 ≥ 4면 compact = 이미지 24 위, 아이콘 세로 1열 아래, 문장 없음. 아이콘 상한 `iconCap` = 층 수 × (데스크톱 2 / 모바일 4 / compact 1), 초과분은 마지막 자리 「+n」 칩.
- **상세**: 데스크톱 팝오버(`role=dialog`, 300px, `shadow-pop`, 호버 150ms·포커스 즉시, 아래 공간 부족하면 위, 우측 넘치면 우측 정렬) / 모바일 바텀 시트(`role=dialog aria-modal`, 70vh, 닫기 버튼·바깥 탭·Escape). 내용 = 팩 이미지 40 + 이름 + 「{k}층 고정」/「{a}~{b}층 중 한 층 · 추천 k」 + 「다른 후보 팩: …」(3개) + 픽업 행(아이콘 44 + 이름 + 반드시 배지 + 조건 문장 + 관측 적격이면 「관측」 버튼). 관측 타일의 시트는 아이콘 44 + 사유 + 지정/해제 버튼.
- **시작 칸**: 타일은 가로 랩(아이콘 32 + 눈 배지 + 「지정/추천」 태그, 이름 없음 — 툴팁 「{이름} · 관측 · {사유}」). 데스크톱 84px 열에서 2열로 감긴다.
- 문구 키(M10 추가): `priorityMust/Normal/Skip`, `priorityOf`, `prioritySetMust/Normal/Skip`, `priorityRestore`, `routeSkipped`, `routeSkippedList`, `routeAllPlanned`, `unresolvedMissing`, `routeWindowCompact`, `routePick`, `routeFixedFloor`, `routeGiftCount`, `routeDetail`, `routeMore`, `routeCandidates`, `routeClose`. 삭제: `optionFloorRange`, `optionBandNormal`, `optionDifficulty`, `optionHardSwitch`, `optionHardLocked`, `optionHardAuto`, `actionExtendFloors`, `actionSwitchHard`, `routeOutOfRange`.


## M11 추가 규칙 (노선도 · 팩 카드 · 팩 충돌 카드)

시안: https://claude.ai/code/artifact/6a034f01-67dd-4106-af5d-8d53dd439184 (v2, 1페이지 「B+E 확정안」). 시간표(M10)를 노선도(B)로, 미해결 카드를 팩 충돌 카드(E)로 바꿨다.

- **세그먼트**(`src/app/lib/metro.ts` `segmentsFor`): 루트의 팩을 **창(`window`)이 같은 것끼리** 한 세그먼트로 묶는다. 창이 없는 팩은 그 층에 고정(`fixed`). 세그먼트 제목: 고정 「{k}층 고정」 / 1팩 「{a}~{b}층 중 한 층」 / n팩 「{a}~{b}층 · {n}팩 · 어느 층이든」 / 부분 겹침 「{a}~{b}층 · 추천 {order}」. **추천 층은 부분 겹침에서만** 보인다 — 창 안 어디든 되는 팩에 추천은 없다.
- **부분 겹침**(`partial`): 같은 밴드에서 창이 교차하되 같지 않은 세그먼트끼리. 둘은 다른 레인에 그리고, 플래너가 배정한 층에 추천 점(`data-testid=suggested`), 두 창이 모두 덮는 역은 반쪽 원(`data-overlap`, 범례 「둘 중 한 팩만」). 창은 「상대 팩이 옮겨 준다」는 가정이라 2~3 vs 3~4 처럼 겹친다.
- **데스크톱**(`metro-columns`): 가로 SVG 선, 시작 원 + 역 15개, 밴드 배경(평행중첩 회색, EXTREME 빗금). 세그먼트는 선 위의 점선(고정은 검은 블록)이고 그 위에 HTML 라벨 카드(`data-testid=segment`, `data-from/to/partial/lane`)가 절대 배치된다. 카드 너비 = 층 열 폭 × 층 수(최소 110px). 카드는 **스카이라인 적층**(`stackBlocks`): 넓은 카드부터 기준선에 놓고, 가로로 겹치는 카드만 그 카드의 **측정 높이**만큼 위로 올린다(2행 카드 하나가 지도 전체를 밀어 올리지 않는다). 첫 렌더는 141px로 추정하고 `useLayoutEffect`로 재측정.
- **폰**(`metro-rows`): 세로 선(층 행 64px), 밴드 라벨은 세로 회전, 세그먼트는 선 옆 레인(18px)의 점선과 오른쪽 카드(높이 = 64 × 층 수 − 8). 부분 겹침은 카드 폭을 열로 나눈다. 1층 카드는 compact(팩 카드 20 + 이름 한 줄).
- **팩 카드**(`PackCard`): 게임 테마팩 비율 8:15 세로 이미지(20/28/48/64/96px 폭) + **아래 이름**(`caption`, `break-keep` 2줄). `onOpen`이 있으면 `button`(`aria-haspopup=dialog`, `aria-label`=팩 이름). 포함 지정한 팩은 링. 이미지는 `packImageUrl`, 실패·없음은 플레이스홀더.
- **팩 시트**(`PackSheet`, 껍데기는 `DetailSurface`): 팩 카드 96 + 이름 + 「Normal 3 · Hard 2~3」식 층 제한 + 상태 배지(「포함 · {k}층」 / 「포함 지정」 / 「루트에 없음」 / 「포기한 팩」) + 「이 팩으로」「이 팩 포기」(포기한 팩은 「되돌리기」) + 「이 팩의 기프트 n」 = 전용 기프트 전부 + 원하는 풀 기프트(전용/원함/반드시 배지, 조건 문장, 관측 적격이면 「관측」). 데스크톱은 팝오버(320px), 폰은 바텀 시트. 반드시 기프트의 유일 팩을 포기할 때 `window.confirm`.
- **팩 충돌 카드**(`PackConflicts`): `conflictGroups`(core)의 그룹마다 「{a}~{b}층 · 자리 {slots}개에 팩 {packs}개」 + 후보 카드(`pack-conflict-card`, `data-included`): 팩 카드 64 + 이름 + 상태 배지 + 가져올 기프트 + 「이 팩으로」/「이 팩 포기」. 포함된 팩은 실선, 미포함은 점선. 그 외 미해결은 M10 행(별/포기/관측). 아래 `<details>` 「포기한 팩 n · 포기한 기프트 m」에 되돌리기. 「이 팩으로」는 `preferredPacks`(플래너가 반드시 넣음), 「이 팩 포기」는 `bannedPacks`; 둘은 배타이고 공유 링크 옵션에 실린다.
- **시작 행**: 키워드 + 관측 타일(데스크톱은 클릭으로 지정 토글, 폰은 시트). 범례 4개: 「이 층 고정」「이 중 한 층」「추천 역 (창이 부분적으로 겹칠 때만)」「둘 중 한 팩만」.
- **텍스트 복사**: 세그먼트 단위 — 「2~3F (어느 층이든): 마주하지 않는 · 낙화」, 「2~3F (2~3층 · 추천 2 → 3): …」, 「4F: 2호선」, 「4~15F: 자유」, 픽업 「  - 불결함 (마주하지 않는)」, 마지막에 「포기한 팩: …」「포기: …」.
- 문구 키(M11 추가): `routeAnyFloor`, `routeSegmentOne`, `routeSegmentMany`, `routeSuggestOrder`, `routeOverlapHint`, `routeSegmentLabel`, `legendSuggest`, `legendOverlap`, `packInclude`, `packIncluded`, `packPreferred`, `packExcluded`, `packNotInRoute`, `packBan`, `packBanned`, `packRestore`, `packGifts`, `packFloors`, `packOpen`, `giftExclusive`, `giftWanted`, `routeConflicts`, `conflictHeader`, `conflictHint`, `routeOtherUnresolved`, `routeBannedList`, `packBanConfirm`, `unresolvedBanned`. 삭제: `routeWindow`, `routeWindowCompact`, `routePick`, `routeGiftCount`, `routeDetail`, `routeMore`, `routeCandidates`.

## M12 추가 규칙 (런 진행 모드)

3단계 루트 화면 안의 토글이다. 런 상태는 **이 기기에만** 저장하고(persist v5의 `run`) 공유 링크에는 싣지 않는다. 조합 목표(`fusionGoal`)는 공유 링크 v4에 실린다.

- **옵션 바**: 런 전에는 「런 시작」(관측 기프트·시작 기프트를 수집 완료로 둔다). 런 중에는 「진행 중」 배지 + 「현재 층」 select(1~15, 방문한 층보다 앞으로는 못 간다) + 「런 종료」(`window.confirm`, 기록 전부 삭제) + 안내 한 줄. `data-testid=run-bar`.
- **팩 시트(런 중)**: 상태 배지 「방문 · {n}층」이 「포함 · {n}층」보다 우선. 「방문 층 지정」(`VisitActions`)을 누르면 열려 있던 시트·팝오버가 닫히고 노선도가 **선택 모드**가 된다: 상단 배너 「{팩} · 들어간 층을 누르세요 · 취소」(`select-banner`), 그 팩이 나오는 역만 `role=button`·`tabIndex=0`·`data-selectable`(점선 후광)이 되고 클릭/Enter/Space로 `visitPack`, Esc·취소로 해제. 「방문 취소」로 되돌린다. 팩은 런당 한 번 방문하므로 다른 층에 다시 지정하면 옮겨진다.
- **기프트 상태(런 중)**: 원하는 기프트 행 아래 3단 `Segmented` 「수집 전 / 완료 / 실패」(`radiogroup` 「{이름} 수집 상태」). 완료는 아이콘 우상단 체크 배지, 실패는 아이콘 흐림 + X 배지(`GiftIcon` `status`, `data-status`). 런 중에는 관측 지정 버튼을 숨긴다(관측은 런 시작 전 일이다).
- **노선도(런 중)**: 지나간 역은 채움 + 체크(`data-passed`), 현재 층 역은 이중 링(`data-current`)과 굵은 번호. 방문한 팩은 그 층의 세그먼트 「{n}층 방문」(`data-passed`, `bg-surface-2`, 실선 테두리)로 그리고 픽업(아직 안 받은 기프트)을 그대로 보인다. 자유 구간 중 지나간 것은 텍스트 복사에 「지남」. 범례에 「지나간 층」「현재 층」 추가.
- **조합 목표**: 2단계 기프트 화면에서 조합 결과 행을 펼치면 재료 칩 옆 「재료도 목표」 체크박스(기본 켬). 끄면 그 결과가 조합 불가능해졌을 때(재료 실패·층 지남) 남은 재료만을 위한 방문을 취소하고 미해결 문구에 「나머지 재료(…)만을 위한 방문은 취소했습니다」를 덧붙인다.
- **앞으로 갈 수 있는 팩**(`AheadPacks`, 런 중·대안 탭이 아닐 때): 현재 층이 속하거나 그 뒤인 밴드 탭 + 검색(팩 이름·전용 기프트 이름) + 팩 카드 48 그리드(`ahead-pack`: 상태 배지, 「전용 n」, 원하는 전용 기프트가 있으면 「원함 n」). 카드 클릭 → 팩 시트(기프트마다 「목표에 추가」/「목표에서 빼기」 = `toggleWanted`, 「이 팩으로」, 「방문 층 지정」).
- **요약·복사**: 「확보」는 수집 완료를 포함(core가 `owned`로 센다), 실패한 기프트가 있으면 「실패 n」 배지. 텍스트 복사 첫 줄에 「진행 중 · 현재 층 nF · 4F 화왕지절, …」.
- **저장**: persist v5 `run`·`fusionGoal`, `sanitizeRun`(정수 층·범위·팩당 한 층·상태 값 검사, `currentFloor`는 방문한 층 + 1 이상), `sanitizeOptions`는 런 옵션을 항상 초기화(옛 링크·저장값이 런을 끼워 넣지 못하게).
- 문구 키(M12 추가): `runStart`, `runEnd`, `runEndConfirm`, `runActive`, `runCurrentFloor`, `runCurrentFloorHint`, `runHint`, `runVisited`, `runVisitedShort`, `runSetVisit`, `runSetVisitHint`, `runSelecting`, `runSelectCancel`, `runSelectFloor`, `runUnvisit`, `runPassed`, `runFailedCount`, `giftStatusLabel/Pending/Got/Failed`, `giftAddGoal`, `giftRemoveGoal`, `fusionGoalIngredients`, `fusionGoalHint`, `aheadPacks`, `aheadPacksHint`, `aheadSearch`, `aheadExclusives`, `aheadNone`, `legendPassed`, `legendCurrent`, `unresolvedFailed`, `unresolvedDropped`.
