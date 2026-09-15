---
name: add-curated-override
description: Record a fact the game's static data does not express — an identity's keywords, a mis-parsed gift condition, an unverified dungeon constant, a display-name fix, a community note. Use when the app shows something wrong that cannot be fixed by re-fetching data.
---

# 큐레이션 오버라이드 작성법

`data/curated/**`는 정적 데이터가 말해주지 않는 사실을 사람이 적어 두는 곳이다. `build-data`가 **마지막에** 병합하므로 항상 원본을 이긴다. 모든 항목에는 `_source`로 근거를 남긴다(나무위키 링크, 인게임 확인 날짜, 스크린샷 경로 등).

**예외가 하나 있다: `identities.json`은 override가 아니라 backfill이다**(6번). 정적 데이터가 아예 없는 인격을 채우는 곳이라, 상류가 그 id를 내보내기 시작하면 원본을 이기는 대신 빌드가 멈춘다.

## 1. 인격 키워드 보정 — `identity-keywords.json`

스킬 데이터에서 도출한 키워드가 실제와 다를 때. 키는 인격 id(`1SSNN`).

```jsonc
{
  "10716": {
    "_source": "인게임 확인 2026-09-11",
    "keywords": { "Combustion": { "skills": 2, "specialSkills": 0 },
                  "Vibration":  { "skills": 2, "specialSkills": 0 } }
  }
}
```

`skills`는 해당 키워드를 부여하는 **공격 스킬 수**다(조건부 기프트가 세는 단위). `specialSkills`는 특수 충전(생체 재료)·특수 출혈(못) 같은 **특수 변형**을 부여·획득하는 공격 스킬 수다 — 「또는 특수 X」가 적힌 조건만 이를 센다. 둘 중 하나는 0보다 커야 한다. 여기에 적은 인격은 `keywordSource: "curated"`가 된다.

## 2. 조건 보정 — `conditions.json`

파서가 문장을 놓쳤거나(`type: "unparsed"`로 남음) 잘못 읽었을 때. 키는 기프트 id.

```jsonc
{
  "9211": {
    "_source": "desc 원문: 6인 이상 / 10인 이상 단계형",
    "conditions": [
      { "type": "keywordSkillCount", "keyword": "Sinking", "min": 6, "scope": "deployed",
        "includesSpecial": true, "tiers": [{ "min": 10, "label": "10인 이상 강화" }] }
    ]
  },
  "9300": { "_source": "조건 없음이 맞음", "conditions": [] }
}
```

조건이 실제로 없는 기프트인데 파서가 만들어냈다면 `"conditions": []`로 비워 둔다.

## 3. 규칙 상수 — `rules.json`

정적 데이터에 없는 게임 규칙. **모든 상수는 코드가 아니라 여기 있어야 한다.**

```jsonc
{
  "giftObservation": {
    "max": 3,
    "fusionResultsAllowed": false,
    "costTable": [70, 160, 270],
    "verified": false,
    "_source": "나무위키 거울 던전 3 기준 — MD7 인게임 확인 필요"
  }
}
```

`verified: false`인 값은 UI가 "확인 필요" 배지를 붙인다. 인게임에서 확인했으면 값과 함께 `verified: true`, `_source`를 갱신한다.

## 4. 표시명 교정 — `names-override.json`

로컬라이제이션 이름이 어색하거나 커뮤니티 통칭과 다를 때. `{ "gifts": { "9088": { "ko": "..." } }, "packs": { "1025": { "ko": "..." } } }`.

## 5. 메모 — `gift-notes.json` / `pack-notes.json`

UI에 그대로 노출되는 사용자 메모. 루트 계획에는 영향을 주지 않는다.

## 6. 정적 데이터에 없는 인격 — `identities.json`

현지화(`Personalities.json`)는 이름을 주는데 상류 OpenLethe에 personality 레코드가 없는 인격. 지금은 10116 「LCE E.G.O:: 차원찢개」(이상) 하나다. 백필 없이 두면 `data:validate`가 **에러**를 낸다.

**다른 큐레이션 파일과 다른 점**:
- **덮어쓰기가 아니다.** 같은 id의 정적 데이터가 생기면 `data:build`가 멈추고 이 항목을 지우라고 말한다. 손으로 적은 값이 진짜 데이터를 영원히 가리지 않게 하려는 것이다.
- **이름·죄인·id는 적지 않는다.** 현지화에서 그대로 오고, 다른 인격과 같은 코드 경로를 지난다(그래서 `names-override.json`도 계속 먹는다).
- **도출할 수 있으면 손으로 적지 않는다.** 키워드는 `localize/KR/Skills_personality-*.json`의 공식 스킬 원문에서 `scripts/lib/derive-text.ts`로 도출하고, `tests/text-derivation.test.ts`가 적어 둔 값이 원문과 같은지 검사한다. 그 도출 규칙은 정적 데이터가 있는 121명에게 미리 맞춰 두었다.
- **모르는 필드는 비운다.** `factions`·`sins`·`attackTypes`를 비우면 계획이 그만큼 **적게** 센다. 근거 없이 채워 과대약속하는 것보다 낫다. 무엇을 왜 비웠는지 `_source`에 적는다.

새 항목을 넣기 전에 먼저 확인할 것: 정말 상류에 없는가(`data:fetch -- --update` 후에도 없는가), 아니면 `sources.lock.json`의 파일 목록에 새 파일이 빠진 것인가.

## 마무리

```bash
npm run data:build && npm run data:validate && npm test
```

오타 난 id는 `[invariant] curated override references unknown id`로 잡힌다. 조건을 바꿨다면 스냅샷 테스트가 변경을 보여주므로 **diff를 읽고 나서** 갱신한다.
