# 웹 UI 리디자인 — 단계형 흐름, 회색 전용 팔레트

디자인 캔버스: https://claude.ai/code/artifact/661ce48e-49f0-479a-b3b0-b286320c2736
(페이지: 「화면」 12장 · 「상태」 8장 · 「토큰 · 컴포넌트」 2장 · 「1단계 스케치」 3장)

이 문서는 캔버스를 코드(`src/app`)로 옮기는 세션을 위한 명세다. `src/core`·`public/data`는 이 디자인과 무관하게 유지하되, 아래 「구현 전제」에 적힌 몇 가지는 디자인이 요구하는 코어·데이터 변경이다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 방향 | 1단계 스케치 A(정제된 stone)를 채택하되 **색은 회색 계열만** 쓴다. amber 포함 유채색 강조 없음 |
| 구분 수단 | 획득 신뢰도·상태는 색이 아니라 **채움 · 선 종류 · 명도 · 아이콘 · 굵기**로 구분 |
| 화면 구조 | 3패널 동시 표시를 버리고 **단계형**: 1 덱 → 2 기프트 → 3 루트. 데스크톱도 한 번에 한 단계 |
| 이미지 | 인격·기프트 이미지 없음(재배포 회피). 이름·등급·키워드 칩으로 식별 |
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
- 카드 12장(데스크톱 4열, 모바일 1열, 높이 124px): 수감자명(11px) · **출격/대기 토글**(체크박스) · 인격명 + `n성` · 키워드 카운트 칩 · **E.G.O 슬롯**.
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
- **조합 계승**: 하위 기프트(예: 요리 비법 전서)는 독립 행이 아니라 상위 기프트(진혼) 아래 **서브행**(`→ 요리 비법 전서 · T3`)으로만 보인다. 상위를 선택하면 서브행에 「포함」 배지. 독립 체크박스 없음.
- 긴 목록: 섹션 헤더 sticky, 가상화(행 높이 고정 44px), 헤더에 `446개 중 · 41~53 표시`.

### 3 루트

- 옵션 바(카드 1줄): **층 밴드 선택기** · **Hard 단방향 스위치** · 관측 최대(세그먼트 0~3) · 시작 키워드 칩 · 「옵션 초기화」.
  - 층 밴드 선택기: 1~15 셀 스트립. 1~5 / 6~10(surface-2) / 11~15(빗금 = 관측 불가) 밴드 배경, 위에 밴드 라벨. 선택 범위는 ink 채움.
  - Hard 스위치: 전환 전 「→ Hard로 전환」 secondary 버튼. 전환 후 ink 채움 「🔒 Hard · 되돌릴 수 없음」, **되돌림 버튼 없음**(옵션 초기화로만). 6층 이상 선택 시 자동으로 잠금 상태가 되고 info 배너 1줄.
- 요약: `필요 팩 2 · 별빛 20 · 확보 4/5`(mono 22px) + 근사 결과 배지(해당 시) + 「텍스트 복사」.
- **시간표**(데스크톱): 열 = 시작 + 1~15층(계획 범위 안은 넓게, 밖은 44px 좁게 「계획 범위 밖」), 행 = 팩 레인 2줄 + 합성 레인.
  - **고정 블록**: ink 채움. `팩명 · 👁 별빛 / 고정 / ✓ 픽업`.
  - **유동 구간 블록**: 점선 테두리, 가능한 층 전체에 걸침. 추천 층 구간은 surface-2 배경 + 굵은 밑줄. `4~5층 중 한 층 · 추천 4`.
  - 자유 층은 「자유」 텍스트만. 시작 열엔 시작 기프트 작은 블록. 합성 레인은 점선 회색 블록(`🛍 합성 → 진혼`).
  - 범례 한 줄.
- 시간표(모바일 400px): 행 = 층, 열 = 레인 2개. 유동 구간은 세로로 걸치고 추천 층은 좌측 굵은 선. 가로 스크롤 없음.
- 아래 카드: 조합(순서대로, 재료·가능 층) · 범용 드랍(점선 카드, 「확정 아님」 고정 문구) · 조건 판정(✓/✕ + `7/5`) · **미해결**(fg 1.5px 테두리 + ⚠, 항목마다 이유 칩 + 사유 1줄 + 조치 버튼). 모바일은 미해결을 요약 바로 아래에 둔다.

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
| 조합 계승 | 하위 기프트는 상위의 서브행. 상위 선택 시 「포함」 |
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
  --shadow-card: none;         --shadow-pop: 0 8px 24px rgb(0 0 0 / .5);
}
```

- 대비(측정): 라이트 fg-3/surface-2 4.68:1, 다크 fg-3/surface-2 4.82:1 — 모든 텍스트가 4.5:1 이상.
- 빗금(EXTREME · 관측 불가): `repeating-linear-gradient(135deg, transparent 0 6px, var(--color-line) 6px 7px)`.
- spacing 4/8/12/16/24/32, 포커스 링 `outline: 2px solid var(--color-fg-2); outline-offset: 2px`.
- 웹폰트: Pretendard를 실제로 로드하거나(`@font-face` 또는 CDN) 선언을 지운다. 현재는 선언만 있고 로드되지 않는다.

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
| `Segmented` | 관측 최대 0~3 | `optionObservation` |
| `HardSwitch` | before(버튼) · locked(잠금) | 새 키 `optionHardSwitch` / `optionHardLocked` |
| `FloorBandPicker` | 1~15, 밴드 3개, 선택 범위 | `optionFloors` |
| `Timetable` | desktop(열=층) · mobile(행=층) · 블록 fixed/window/fuse/start · 자유 · 범위 밖 · 범례 | 새 키 `routeFixedFloor`, `routeWindow`, `routeRecommended`, `routeOutOfRange`, `routeFree` |
| `Card` | 기본 · dashed(범용 드랍) · strong(미해결·에러) | |
| `Notice` | info · warning(근사 결과) | `routeWarnings`의 `search-capped`는 배너로 분리 |
| `UnresolvedCard` | 이유 칩 6종 + 조치 버튼 | `UnresolvedReason` 라벨 키 신설 |
| `Toast` | 성공 | `shared`, `routeCopied` |
| `DeckCard` | deployed · reserve · empty · 토글 disabled | `deckDeployed` `deckReserve` `deckEmptySlot` |
| `EgoSlot` | empty · selected · +delta | 새 키 `deckEgo`, `deckEgoDelta` |
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
| `deckEgo` | E.G.O | E.G.O |
| `deckEgoNone` | E.G.O 선택 | Choose E.G.O |
| `deckEgoDelta` | +특수 {keyword} | +special {keyword} |
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
| `routeOutOfRange` | 계획 범위 밖 | Outside plan |
| `routeFuseAt` | {floor}층 이후 상점·휴식 | Shop or rest from floor {floor} |
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
2. **E.G.O 데이터** — 저장소에 E.G.O 데이터가 없다. E.G.O 목록(인격별 장착 가능 E.G.O 이름)과 「E.G.O가 바꾸는 키워드 판정」 보정표를 `data/curated/ego-keywords.json`(`_source` 필수)에 두고, `deck.ts` `conditionCount`가 `identity.keywords[kw].special`과 조건의 `includesSpecial`을 실제로 반영하게 한다. 캔버스의 E.G.O 이름·「+특수 화상」은 **샘플**이다.
3. **유동 구간(`window`)** — `search.ts`의 `Candidate.slots`는 결과에서 버려진다. `FloorPlan`에 `window: {from, to} | null`을 추가해 같은 팩이 놓일 수 있었던 연속 층 범위를 남긴다(Hard 팩 45개는 인접 2층, 평행중첩 팩 45개는 6~10 전체). 고정 블록은 `window == null` 또는 `from == to`.
4. **조합 계승 파생** — 빌드 시 `gifts.json`에 `fusion.upgradeOf: number | null`을 추가: 어떤 결과 기프트의 유일한 재료이면서 같은 키워드·낮은 등급이면 그 결과의 id(현재 76쌍, 3/4재료 이중 레시피 8쌍 포함). UI는 `upgradeOf`가 있는 기프트를 상위 행의 서브행으로 그린다.
5. **조건 정렬** — `evaluateConditions` 결과로 `satisfied` → `have/need` 비율 순 정렬 헬퍼를 `src/app`에 둔다(코어 변경 없음). `fullResonance`·`unparsed`는 「판정 불가」로 표시.
6. **전체 인격 검색** — `DeckPanel` 검색을 수감자 한정과 전체 두 경로로. 결과는 수감자별 그룹.
7. **가상화** — 기프트 목록 상위 200개 슬라이스 대신 고정 높이 44px 가상 목록.
8. **죄악·가격 필터** — 스키마에 이미 있는 `gift.sin`, `gift.price`를 필터 칩으로.
9. **근사 결과 분리** — `warnings` 중 `search-capped`는 배너 + 요약 배지, 나머지는 기존 목록.
10. **미해결 조치 버튼** — 이유별 조치: `no-pack-in-range`/`pack-conflict` → 층 범위 확장 또는 관측 허용, `hard-only` → Hard 전환. 조치는 옵션을 바꾸고 재계산할 뿐 코어 변경 없음.

## 검증 (캔버스 기준)

- 모바일 보드 8장 모두 400px 뷰포트에서 요소 최대 우측 좌표 ≤ 400(가로 스크롤 0). 데스크톱 12장 1440px 클리핑 없음.
- 텍스트 대비 라이트/다크 모두 4.5:1 이상(위 토큰 표).
- 캔버스 각 보드는 PNG/PDF로 내보낼 수 있다.
