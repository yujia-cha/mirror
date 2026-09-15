---
name: md-domain
description: Mirror Dungeon domain reference for this project — floor and difficulty rules, theme pack ID ranges and floor encoding, gift acquisition classes, fusion, conditional-gift grammar, keyword and faction enums, and which data file holds what. Read this before touching game data, the route planner, or any UI that explains a rule.
---

# 거울 던전 도메인 레퍼런스

Everything here was read out of the game's own static data; `docs/research/mechanics.md` has the citations.

## Modes and floors

| 모드 | `typeIndex` | `dungeonIdx` | 층 | 비고 |
|---|---|---|---|---|
| Normal | 0 | 0 | 1-5 | 인격 레벨 60 고정 |
| Hard | 1 | 1 | 1-5 | 보스 보상 3→4개, 2개 선택(고난 2개), Hard 전용 기프트 존재 |
| 평행중첩 | 2 | 2 | 6-10 | 1-5층을 **전부 Hard**로 클리어해야 진입 |
| 평행중첩 EXTREME | 3 | 3 | 11-15 | 10층 클리어 후 선택 진입, **테마팩 관측 불가**, 장기전 팩만 |

- 난이도는 테마팩 선택 화면에서 팩 단위로 고른다. **Hard를 한 번 고르면 되돌릴 수 없다** (sticky).
- 층당 테마팩 3개 제시(`themePoolNum`), 기본 새로고침 1회. 같은 런에서 방문한 팩은 다시 안 나온다.
- 테마팩 관측: 20 별빛 시작, 사용마다 +10, 미열람 팩은 ×1.5.

## 테마팩 ID 대역

| 대역 | 성격 |
|---|---|
| 1001-1027 | 챕터(스토리) 팩 |
| 1101-1128 | 인터발로 · 발푸르기스의 밤 · 거울굴절철도 · 복각(BokGak) 팩 |
| 1201-1206 | 공격 유형 팩. `-이들`은 해당 유형 강화, `-것`은 해당 유형 약점 적 |
| 1301-1321 | 죄악 팩. 죄악마다 `-1`(Normal 4-5층/Hard 3-4층), `-2`(Hard 5층/평행중첩), `약점`(Normal 3층/Hard 2층) |
| 1401-1414 | 키워드 팩 7종 × 2. **전부 Hard 이상 전용.** `-1`은 Hard 3층, `-2`는 Hard 4-5층 + 평행중첩 |
| 1501-1520 | EXTREME 장기전 팩 (11-15층) |
| 3001 | 히든 팩 「뽕.황」. 정적 파일이 배포되지 않아 규칙은 `data/curated/rules.json`에 기록 |

`1122 선의의 순례`는 `exceptionConditions`가 비어 있어 거울 던전에서 선택할 수 없다(스토리 던전 전용).

## 층 제한 해석

```jsonc
"exceptionConditions": [
  { "dungeonIdx": 0, "selectableFloors": [0, 1] },  // Normal 1층, 2층
  { "dungeonIdx": 1, "selectableFloors": [0] },     // Hard 1층
  { "dungeonIdx": 2 }                                // 평행중첩 6-10층 전체
]
```

`selectableFloors`는 **0-기준**이므로 `+1`이 실제 층이다. dungeonIdx 2/3 항목에 `selectableFloors`가 없으면 그 모드의 전 구간을 뜻한다.

## 기프트 획득 분류

- **범용(general)**: 거의 모든 팩의 `egoGiftPool`에 있음(187종). 어느 팩에서나 나올 수 있지만 **확정이 아니다**.
- **테마팩 한정(packLimited)**: 특정 팩의 `specificEgoGiftPool`에 있음(171종). 그 팩에 들어가야 얻는다. 복각 팩은 원본 팩의 전용 기프트를 공유한다.
- **조합 전용(fusionOnly)**: 팩 풀에 없고 상점/휴식의 「E.G.O 기프트 합성」으로만 얻는다(59종).
- **시작(startOnly)**: `startEgoGiftPools`의 키워드별 3종.
- **클리어 보상(clearReward)**: EXTREME 팩(1511~1520)의 보스 스테이지 `rewardList`가 주는 기프트 10종(9250~9255, 9827~9830). `acquisition.clearRewardOf`가 팩 id. 그 팩을 11~15층에 넣으면 확정.
- **히든 전투(hiddenBattle)**: 11~15층에서 층당 10%로 나오는 히든 전투의 보상 4종(9256~9259). 팩과 무관하고 확정 불가 → 플래너는 `chance-only` 미해결.
- **이벤트(event)**: 선택지·저주 해제 등 10종. 위 셋을 합치면 드롭풀의 `globalExcludeEgoGifts` 24종.
- **관측 가능(observable)**: 「E.G.O 기프트 관측」이 제시할 수 있는 312종(`mirror-dungeon-egogift-observation-data`). 조합 결과물·클리어 보상·일부 테마팩 한정(9283 등)은 관측할 수 없다. 비용 70/160/270, 최대 3개.
- **Hard 전용**: `nonAcquireableInEasyIds` 53종. 대부분 조합 결과물.

## 조합

- 고정 레시피는 `egoGiftCombineFixedTable.combineFixed` 67행. 같은 결과에 3재료 레시피와 그 하위 재료를 풀어쓴 4재료 레시피가 함께 있다. **`requiredEgoGiftIds`가 실제 재료 목록**이고 `a/b/c` 필드는 해시용이다.
- `combineMixed` 1행: 7키워드 상위 기프트 중 **2개** + 참격/관통/타격 상위 기프트 **3개** → 9083. 키워드 팩이 Hard 전용이라 이 레시피가 루트 계획에서 가장 까다롭다.
- 재료 수에 따른 성공 확률 0.6/0.9/0.99(별빛 사용 시 0.9/0.99/0.9999). 합성 칸이 3개를 넘게 필요하면 일반 상점에서 불가(특별 상점 필요).

## 조건부 기프트 문법

```
<키워드> 부여하는 공격 스킬을 보유한 인격이 N인 이상   (E.G.O 스킬 제외. 대기 인원 제외)
<소속>(또는 <소속>) 소속 인격이 N인 이상               (출격 인원 기준 | 대기 인원 포함)
완전 공명이 N 이상
```

**키워드 조건은 인격의 태그가 아니라 "해당 키워드를 부여하는 공격 스킬 보유 여부"로 센다.** 그래서 인격 키워드는 `skill/personality-skill-*.json`에서 도출한다. 소속 조건은 `personality-*.json`의 `associationList`로 센다(`unitKeywordList`가 아니다).

**정적 데이터에 없는 인격**: 현지화는 이름을 주는데 상류 OpenLethe에 레코드가 없는 인격이 있다(10116 「LCE E.G.O:: 차원찢개」, 이상). `data/curated/identities.json`이 백필하고 키워드는 공식 스킬 원문에서 도출한다(`scripts/lib/derive-text.ts`). 이것은 override가 아니라 **backfill**이라 정적 데이터를 덮지 못한다 — 상류가 같은 id를 내보내면 `data:build`가 멈춘다. 현지화에만 있는 인격이 백필 없이 남으면 `data:validate`가 **에러**다.

**탄환**(`Bullet`, EN Ammo)은 7키워드와 달리 **기프트·팩·시작 풀이 없는 인격 전용 키워드**다. 적에게 부여하는 상태가 아니라 스킬이 소모하는 자원이라 `buffKeyword`가 아니라 스킬 스크립트의 요구 토큰(`UseBullet[necessary:Bullet:1]`, `[optional:AccelBullet:1]`)으로 도출한다. 탄환 계열 버프 id에는 모두 `Bullet`이 들어 있다. 현재 13명이 해당한다.

**특수 변형**(특수 충전 = 생체 재료, 특수 출혈 = 못, 특수 탄환 = 호표탄·포자탄 …)은 별도 버프다. `BattleKeywords.json` 설명에 「- 특수 충전」 한 줄이 선 버프가 변형이고, 인격의 `keywords[K].specialSkills`로 따로 센다. 조건 문장에 「또는 특수 X」가 있으면(`includesSpecial`) 변형도 포함하고, 없으면 기본 키워드(`skills > 0`)만 센다.

범위(scope) 구분:
- `출격 인원 기준` / `대기 인원 제외` → 출격 6인만
- `대기 인원 포함` / `편성된` → 편성 12인 전체
- 명시가 없으면 출격 6인으로 본다

## 키워드 / 소속

키워드 내부명 → 한국어: `Combustion` 화상, `Laceration` 출혈, `Vibration` 진동, `Burst` 파열, `Sinking` 침잠, `Breath` 호흡, `Charge` 충전, `Slash` 참격, `Penetrate` 관통, `Hit` 타격, `None` 범용. 앞 7개가 「기본 7키워드」, 뒤 3개는 공격 유형이다.

소속 내부명은 `UnitKeyword.json`에 한국어/영어가 있다. 표시 문자열에 `<color>`/`<s>` 마크업이 섞여 있으므로 제거해야 하고, `<s>`로 감싸인 것은 폐기된 소속이다.

## 데이터 파일 지도

| 알고 싶은 것 | 파일 |
|---|---|
| 팩의 층 제한 · 기프트 풀 · 전용 기프트 | `data/raw/static/mirrordungeon-theme-floor/*.json` |
| 기프트 등급 · 키워드 · 가격 · 강화 | `data/raw/static/ego-gift-mirrordungeon/*.json` |
| 조합 · Hard 전용 · 시작 기프트 풀 · 별빛 비용 | `data/raw/static/mirror-dungeon-common-data/*.json` |
| 현재 시즌 드롭풀 | `data/raw/static/mirrordungeon-egogift-droppool/*.json` |
| 층 구성 · 모드 | `data/raw/static/mirrordungeon/mirrordungeon-07*.json` |
| 인격 소속 · 등급 · 스킬 id | `data/raw/static/personality/*.json` |
| 인격 스킬이 부여하는 키워드 | `data/raw/static/skill/personality-skill-*.json` |
| 이름 · 효과 텍스트 | `data/raw/localize/{KR,EN}/*.json` |
| 인격 스킬 텍스트 (한국어) | `data/raw/localize/KR/Skills_personality-*.json` — 12파일, 183명 중 121명만 덮는다 |
| 정적 데이터에 없는 인격 | `data/curated/identities.json` — 지금은 10116 「LCE E.G.O:: 차원찢개」 하나 |
| 정적 데이터에 없는 규칙 | `data/curated/rules.json` |
