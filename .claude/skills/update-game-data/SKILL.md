---
name: update-game-data
description: Refresh the vendored Limbus Company game data after a patch or a new Mirror Dungeon season, then regenerate and verify public/data. Use when the game updated, when a new pack or gift is missing from the app, or when someone asks to update the data.
---

# 게임 데이터 갱신 런북

## 1. 원본 갱신

```bash
npm run data:fetch -- --update      # sources.lock.json의 sha를 최신 main으로 올리고 data/raw 재다운로드
git --no-pager diff --stat data/sources.lock.json data/raw
```

`--update` 없이 실행하면 lock에 적힌 sha 그대로 내려받는다(재현용). 네트워크가 막힌 환경이면 `data/raw`가 이미 커밋되어 있으므로 이 단계를 건너뛰어도 빌드는 된다.

## 2. 재생성과 검증

```bash
npm run data:build
npm run data:validate
npm run data:diff                   # 이전 커밋 대비 추가/삭제/변경된 id 요약
npm test
```

## 3. 시즌이 바뀐 경우 (거울 던전 8 등)

정적 파일 이름에 시즌 번호가 들어간다. 확인할 것:

1. `mirror-dungeon-common-data-md8.json`, `mirrordungeon-08*.json`, `mirrordungeon-egogift-droppool-8.json`이 `data/sources.lock.json`의 파일 목록에 있는지. 없으면 추가한다.
2. `build-data`는 `mirror-dungeon-common-data-*.json`의 `currentDungeonId`를 읽어 시즌을 정하므로, 새 파일만 들어오면 대개 자동으로 따라간다.
3. 새 테마팩 대역이 생겼으면 `src/core/data/packs.ts`의 `groupForPackId()`에 대역을 추가하고 `md-domain` 스킬의 표를 갱신한다.
4. `mirrordungeon-theme-floor-t7.json`처럼 tier 파일이 늘면 glob이 잡아주지만, lock 파일 목록에는 명시해야 한다.

## 4. 검증이 실패할 때

`npm run data:validate`가 불변식 위반을 보고하면 **게임이 바뀐 것인지 파이프라인이 깨진 것인지** 먼저 판단한다.

- 팩 수·기프트 수가 늘었을 뿐이면 `scripts/validate-data.ts`의 기대 하한을 올리고, 커밋 메시지에 "MD8에서 팩 N개 추가" 같은 근거를 남긴다.
- 범용 기프트 집합이 EXTREME 팩 풀과 더 이상 일치하지 않으면 파생 규칙이 깨졌을 가능성이 높다. `validate-data`의 경고만 보고 넘기지 말고 `docs/research/mechanics.md`를 다시 확인한다.
- 조건 파서 스냅샷이 바뀌면 `npx vitest run scripts -u` 전에 **변경된 문장을 눈으로 읽는다**. 새 문형이 생겼다면 파서에 패턴을 추가하는 것이 맞다.

## 5. 마무리

- `public/data/meta.json`의 `dataVersion`은 빌드가 자동으로 올린다(날짜 + 일련번호).
- `docs/research/changelog.md`에 한 줄 추가: 날짜, 시즌/패치, 무엇이 바뀌었는지.
- 커밋: `data: MD7 2026-09-04 패치 반영 (기프트 +6, 팩 +2)` 형태로 수치를 넣는다.
