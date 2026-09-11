# 거울 던전 메커니즘 — 조사 기록

모든 수치는 게임 클라이언트 정적 데이터에서 직접 읽었다. 파일 경로는 `data/raw/static/` 기준이며, 원본은 `data/sources.lock.json`에 sha로 고정되어 있다. 조사 시점: 2026-09-11.

## 1. 시즌과 모드

현재 시즌은 **거울 던전 7 「이름과 거미의 거울」**(2026-02-19 Normal, 2026-02-26 Hard). 근거: `mirror-dungeon-common-data/mirror-dungeon-common-data-md7.json`의 `currentDungeonId: 7`, 로컬라이제이션 `MirrorDungeonUI_7.json`의 `mirror_dungeon_progress_text_7 = "이름과 거미의 거울 {0}층"`.

| 파일 | `typeIndex` | 모드 | 층 수 | 층별 적 레벨 |
|---|---|---|---|---|
| `mirrordungeon-07.json` | 0 | Normal | 5 | 60 × 5 |
| `mirrordungeon-07-hard.json` | 1 | Hard | 5 | 60,61,62,63,64 |
| `mirrordungeon-07-infinite.json` | 2 | 평행중첩 | 10 | 60~64 후 64 고정 |
| `mirrordungeon-07-extreme.json` | 3 | 평행중첩 EXTREME | 15 | 위와 같고 11층 이후 64 |

네 파일 모두 `winFloorIdx: 4` — 즉 **5층 클리어가 "완주"**이고 6층 이후는 확장이다.

튜토리얼 문자열(`TutorialMirrorDungeon.json`)에서 확인한 규칙:

- `TutoMD07_P9_D4~D5`: 테마팩 선택 단계에서 난이도를 고르며, **Hard로 입장하면 이후 난이도를 변경할 수 없다.**
- `TutoMD07_P9_D6`: Hard 팩은 보스 클리어 보상 기프트가 3→4개, 2개 선택(고난도 2개 추가).
- `TutoMD07_P9_D7`: Hard에서만 등장하는 특별 상점이 있고, **특정 기프트는 Hard에서만** 얻는다.
- `TutoMD07_P26_D2`: 평행중첩 모드는 **5층까지 전부 Hard로 클리어**해야 적용된다.
- `TutoMD07_P32_D1~D2`: 평행중첩 상태에서 10층 클리어 시 EXTREME 적용 여부를 묻고, 확인하면 11층으로 간다.
- `TutoMD07_P34_D2`: 합성 칸이 3개를 초과로 필요하면 일반 상점에서 조합이 불가능하다(하위 재료를 먼저 조합하거나 특별 상점 이용).

## 2. 테마팩

`mirrordungeon-theme-floor/mirrordungeon-theme-floor-t{1..6}.json`에 **116개**. 항목 구조:

```jsonc
{
  "id": 1402,
  "desc": "화상-2",                        // 개발용 이름. UI에 쓰지 않는다
  "unlockCondition": { "unlockCode": 9103 },
  "exceptionConditions": [
    { "dungeonIdx": 1, "selectableFloors": [3, 4] },   // Hard 4층, 5층
    { "dungeonIdx": 2 }                                 // 평행중첩 6~10층 전체
  ],
  "egoGiftPool": [9001, ...],              // 이 팩에서 나올 수 있는 전체
  "specificEgoGiftPool": [9267, 9282],     // 이 팩 한정 (UI: 「테마 팩 한정」)
  "mapGenOption": { "bossPool": [...], "battlePool": [...], "eventPool": [...] },
  "mapGenSequence": [{ "type": "CREATE_EMPTY_MD4_FLOOR", "numberList": [4, 3, 1] }, ...]
}
```

`selectableFloors`는 **0-기준**(0=1층). `dungeonIdx` 2/3 항목에 `selectableFloors`가 없으면 그 모드의 전 구간을 뜻한다. 이 해석은 OpenLethe 서버 재구현의 `MdMapGen.RecreateThemes`가 `act = selectionFloor / 5 + 1`로 dungeonIdx를 고르고, `c.selectableFloors.Count == 0 || c.selectableFloors.Contains(selectionFloor)`로 필터하는 코드와 일치한다.

### ID 대역별 성격

| 대역 | 개수 | 성격 | 층 패턴 |
|---|---|---|---|
| 1001-1027 | 27 | 챕터 팩 | 1001~1017은 Normal 1~5/Hard 1~4에 흩어져 있고, 1018~1027은 Hard 5층 + 평행중첩 |
| 1101-1128 | 28 | 인터발로·발푸밤·철도·복각 | 복각(BokGak) 팩은 Hard 4~5층 + 평행중첩에 몰려 있다 |
| 1201-1206 | 6 | 공격 유형 | `-이들`(강화형) Normal 5층/Hard 4층, `-것`(약점형) Normal 2~3층/Hard 1~2층 |
| 1301-1321 | 21 | 죄악 | 죄악마다 `-1`(N 4~5/H 3~4), `-2`(H 5 + 평행중첩), `약점`(N 3/H 2) |
| 1401-1414 | 14 | 키워드 7종 × 2 | **전부 Hard 이상.** `-1`은 Hard 3층만, `-2`는 Hard 4~5층 + 평행중첩 |
| 1501-1520 | 20 | EXTREME 장기전 | 11~15층 전용 (`dungeonIdx: 3`) |
| 3001 | 1 | 히든 「뽕.황」 | 정적 파일(`mirrordungeon-theme-floor-hidden`)이 배포되지 않음 |

`1122 선의의 순례`는 `exceptionConditions`가 비어 있어 거울 던전에서 선택할 수 없다(스토리 던전 전용).

### 선택·관측 규칙

`mirror-dungeon-common-data-md7.json`:

| 필드 | 값 | 의미 |
|---|---|---|
| `themePoolNum` | 3 | 층당 제시되는 테마팩 수 |
| `themePoolRecreateCount` | 1 | 기본 새로고침 횟수 |
| `starlightInfo.detectThemeFloorDefaultPoint` | 20 | 테마팩 관측 기본 비용 |
| `starlightInfo.detectThemeFloorPointMultiplier` | 10 | 사용마다 증가분 |
| `starlightInfo.detectunentrancedThemeFloorPointMultiplier` | 1.5 | 미열람 팩 배수 |
| `starlightInfo.initPoint` | 1200 | 시작 별빛 |
| `starlightInfo.rewardInfo.hardDifficultyBonusMultiplier` | 4 | Hard 클리어 별빛 배수(Normal은 1) |

시작 버프(`DungeonStartBuffs_MD7.json`)로 조정 가능한 것: `ADDITIONAL_FLOOR_THEME_SLOT`(테마팩 목록 +N), `ADDITIONAL_FLOOR_THEME_REFRESH`(새로고침 +N), `ADDITIONAL_START_EGO_GIFT_SELECT`(시작 기프트 수 +N).

같은 런에서 이미 방문한 팩은 다시 제시되지 않는다(관측으로도 불러올 수 없다).

## 3. E.G.O 기프트

`ego-gift-mirrordungeon/*.json` 31개 파일. 거울 던전 대역(9000~9999) base 기프트는 로컬라이제이션 기준 **456종**, 현재 시즌 드롭풀(`mirrordungeon-egogift-droppool-7.json`)은 **441종**.

```jsonc
{
  "id": 9041,
  "attributeType": "CRIMSON",          // 죄악 색
  "tag": ["TIER_2"],                    // TIER_1..TIER_5, TIER_EX, NO_SALE, HARDSHIP, CONSTRAINT
  "keyword": "Sinking",                 // 없으면 범용
  "lockType": false,
  "price": 188,
  "upgradeDataList": [                  // 강화 단계. localizeID가 +10000/+20000
    { "upgradeLevel": 0, "localizeID": 9041, "abilityIDList": [9041, 90411] },
    { "upgradeLevel": 1, "localizeID": 19041, "abilityIDList": [19041, 190411] },
    { "upgradeLevel": 2, "localizeID": 29041, "abilityIDList": [29041, 290411] }
  ]
}
```

이름·효과는 `EGOgift_MirrorDungeon*.json`(KR/EN)의 `dataList: [{id, name, desc, simpleDesc}]`. `desc`에 `[Combustion]` 같은 상태 토큰과 `<style="upgradeHighlight">`, `<noparse>` 태그가 섞여 있으므로 표시 전 치환·제거가 필요하다.

키워드 표시명은 `EgoGiftCategory.json`: Combustion 화상, Laceration 출혈, Vibration 진동, Burst 파열, Sinking 침잠, Breath 호흡, Charge 충전, Slash 참격, Penetrate 관통, Hit 타격, None 범용, Random 무작위.

### 획득 분류 (팩 풀 집계 결과)

| 분류 | 개수 | 판정 |
|---|---|---|
| 팩 풀 합집합 | 358 | 어느 팩이든 `egoGiftPool`에 등장 |
| 테마팩 한정 | 171 | 어떤 팩의 `specificEgoGiftPool`에 등장 |
| 범용 | 187 | 팩 풀에 있으나 어디서도 전용이 아님 |

범용 187종은 EXTREME 팩 1501의 `egoGiftPool`과 **집합이 정확히 일치**한다(EXTREME 팩은 전용 기프트가 없으므로 범용 풀 그대로). 이 일치를 `data:validate`의 불변식으로 쓴다.

전용 기프트 중 53종은 여러 팩이 공유한다(복각 팩이 원본 팩의 전용 기프트를 물려받는 경우).

### 조합

`mirror-dungeon-common-data-md7.json` → `egoGiftCombineFixedTable`:

- `combineFixed` **67행**, 결과 **59종**. 같은 결과에 3재료 레시피와 하위 재료를 풀어쓴 4재료 레시피가 함께 있다. **`requiredEgoGiftIds`가 실제 재료 목록**이고 `aEgoGiftId`/`b`/`c`는 서버의 해시 조회용이다(OpenLethe `MdEgoFusion.Hash3`).
- `combineMixed` **1행**: `aEgoGiftIds`(7키워드 상위 기프트 9105·9110·9116·9121·9126·9131·9136) 중 **2개** + `bEgoGiftIds`(참격·관통·타격 상위 9142·9147·9152) **3개** → **9083**. 키워드 팩이 Hard 전용이라 이 레시피가 루트 계획에서 가장 까다롭다.
- `nonAcquireableInEasyIds` **53종** = Hard 전용 기프트. 대부분 조합 결과물이다.
- 등급 점수: T1=3, T2=6, T3=10, T4=15, T5=30. 합계 구간별 결과 등급(`combineTierResultByCombineScore`): 6~10→1, 11~16→2, 17~24→3, 25+→4.
- 성공 확률(`egogiftRandomCombineProbs`): 재료 2/3/4개 → 0.6/0.9/0.99, 별빛 사용 시 0.9/0.99/0.9999.
- 고정 레시피 결과물은 팩 풀에 없다. `MirrorDungeonEgoGiftLockedDesc.json`이 `획득 조건: 상점 「E.G.O 기프트 합성」`이라고 명시한다.
- 재료 전용 기프트: `pieceEgoGiftIds: [9991..9995]` = 잔영 계열.

### 시작 기프트

`startEgoGiftPools` — 10개 키워드(7키워드 + 참격·관통·타격) × `normalpool` 3종:

| 키워드 | 후보 |
|---|---|
| Combustion | 9001, 9009, 9103 |
| Laceration | 9005, 9029, 9108 |
| Vibration | 9044, 9086, 9113 |
| Burst | 9047, 9093, 9117 |
| Sinking | 9041, 9054, 9124 |
| Breath | 9046, 9051, 9129 |
| Charge | 9043, 9052, 9134 |
| Slash | 9032, 9194, 9140 |
| Penetrate | 9030, 9198, 9145 |
| Hit | 9012, 9202, 9150 |

`startEgoGiftPoolCreatedMaxCount: 2`(생성 가능한 시작 풀 수), `selectNewStartEgoGiftCategoryChip: 12`(새 키워드 열기), `startBuffEgoGiftRefreshDefaultPoint: 10`(새로고침).

**미확인**: 별빛을 쓰는 「E.G.O 기프트 관측」의 비용표. UI 문자열(`mirror_observation_ego_gift_title`, `별빛 {0}개를 소모하여 E.G.O 기프트 관측을 진행하시겠습니까?`)은 존재하지만 MD7 정적 데이터에서 비용표를 찾지 못했다. 나무위키의 70/160/270은 거울 던전 3 시절 값일 가능성이 있어 `data/curated/rules.json`에 `verified: false`로 기록했다.

## 4. 조건부 기프트

KR `desc`에서 두 가지 문형이 반복된다.

**키워드형 (39종)**

```
턴 시작 시, [Combustion] 횟수 또는 특수 화상을 부여하는 공격 스킬을 보유한 인격이 5인 이상이면,
이번 전투 동안 발동 (E.G.O 스킬 제외. 대기 인원 제외)
```

**인격의 키워드 태그가 아니라 "해당 키워드를 부여하는 공격 스킬을 보유한 인격 수"를 센다.** 단계형도 있다(9211 먹장구름: 6인 이상 / 10인 이상).

**소속형 (17종)**

```
편성된 피쿼드호 소속 인격이 3인 이상일 때 발동 (대기 인원 포함)
검계 소속 인격이 3인 이상일 때 발동 (출격 인원을 기준으로 함)
전투에 참여한 인격 중 검계 또는 흑운회 소속이 4인 이상일 경우
중지 소속 인격이 3인 이상 / 5인 이상  (단계형)
```

범위(scope): `출격 인원 기준`·`대기 인원 제외` → 출격 6인, `대입 인원 포함`·`편성된` → 편성 12인. 명시가 없으면 출격 6인으로 본다.

**공명형**: 9208 인연 얽힘 — `전투 시작 시 완전 공명이 7 이상이면`.

## 5. 인격

`personality/personality-{01..12}.json` 합계 **183명**(로컬라이제이션 `Personalities.json`은 186행, EGO 장비·스킨 등 비플레이어 행 포함).

```jsonc
{
  "id": 10403,                           // 1 + SS(수감자) + NN(인격 번호)
  "rank": 3,
  "season": 0,
  "associationList": ["BLACK_CLOUD"],    // ← 기프트 "소속" 조건이 보는 필드
  "unitKeywordList": ["CLAN", "SMALL"],  // 특성 태그 (소속과 다름)
  "uniqueAttribute": "...",
  "attributeList": [{ "skillId": 1040301, "number": 3 }, ...]
}
```

소속 표시명은 `UnitKeyword.json`(82행, `associationName_*`는 3행뿐이라 쓸 수 없다). `<color=#d40000><s>가씨 가문</s></color>`처럼 마크업이 섞인 폐기 소속이 있으므로 태그 제거 후 `deprecated` 표시를 한다.

**인격 키워드는 정적 필드가 아니다.** `skill/personality-skill-{01..12}.json`의 `skillData[].coinList[].abilityScriptList[].buffData.buffKeyword`에서 7키워드를 집계해 도출한다. 표본 검증:

| 인격 | 도출 결과 | 커뮤니티 데이터와 일치 |
|---|---|---|
| 10101 LCB 수감자 이상 | Sinking | ✓ 침잠 |
| 10102 남부 세븐 협회 6과 이상 | Burst | ✓ 파열 |
| 10403 흑운회 와카슈 료슈 | Laceration | ✓ 출혈 |
| 10716 거미집 엄지 제자 히스클리프 | Combustion, Vibration | ✓ |
| 10914 R사 제4무리 순록팀 로쟈 | Sinking, Charge | ✓ |
| 11216 새벽 사무소 대표 그레고르 | Combustion, Vibration | ✓ |

183명 중 6명은 7키워드를 전혀 부여하지 않는다(정상). 특수 화상·특수 출혈 같은 변형은 스크립트명으로 완전히 잡히지 않으므로 `data/curated/identity-keywords.json`으로 보정한다.

## 6. 남은 불확실성

| 항목 | 상태 |
|---|---|
| E.G.O 기프트 관측 비용표 | 정적 데이터에 없음. `rules.json`에 `verified: false` |
| 히든 팩 3001 「뽕.황」의 층·확률 | 정적 파일 미배포. 커뮤니티 추정(Hard 3층~10층, 0.02%)을 `rules.json`에 기록 |
| 특수 키워드 변형(특수 화상 등) 판정 | 스킬 스크립트명 기반 1차 추정 + 큐레이션 보정 |
| E.G.O 스킬 제외 규칙 | 1차 구현은 기본 공격 스킬만 집계 |
