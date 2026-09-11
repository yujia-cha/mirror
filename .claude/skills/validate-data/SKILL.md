---
name: validate-data
description: Interpret and fix failures from npm run data:validate — schema errors, dangling references, broken invariants, stale generated output. Use when data validation fails or when adding a new invariant.
---

# 데이터 검증 실패 대처

`npm run data:validate`는 세 층으로 검사한다: **스키마**(Zod) → **참조 무결성** → **도메인 불변식**. 메시지 앞의 대괄호가 어느 층인지 알려준다.

## `[schema]` — 모양이 틀림

Zod 경로가 그대로 나온다(`gifts[142].tier: Expected 1|2|3|4|5|"EX"|null, received 6`).

보통 원인은 게임에 새 값이 생긴 것이다. `src/core/schema.ts`의 유니온을 넓히고, 그 값을 UI가 어떻게 표시할지도 함께 정한다. 스키마를 `z.any()`로 무력화하지 말 것.

## `[ref]` — 존재하지 않는 id를 가리킴

`pack 1025 giftPool references unknown gift 9999` 형태.

- 기프트 id가 로컬라이제이션에만 있고 정적 데이터에 없거나 그 반대인 경우가 대부분이다. `data/raw`에서 해당 id를 grep해 어느 쪽이 빠졌는지 본다.
- 로컬라이제이션 파일이 lock 목록에서 누락된 것이 흔한 원인이다(`EGOgift_MirrorDungeon_8.json` 같은 새 파일).
- 게임에서 실제로 삭제된 id라면 `build-data`가 이미 걸러야 한다. 걸러지지 않으면 필터 조건을 고친다.

## `[invariant]` — 도메인 규칙이 깨짐

| 메시지 | 의미 | 보통의 원인 |
|---|---|---|
| `general gift set (N) != EXTREME pack pool (M)` | 범용 기프트 판정이 깨짐 | EXTREME 팩 풀 구조가 바뀌었거나 파생 규칙이 틀림 |
| `floor F has only N selectable packs (< themePoolNum)` | 어떤 층에 제시할 팩이 부족 | `selectableFloors` 해석 오류(0-기준 잊음) |
| `fusion result G appears in pack pool` | 조합 전용이어야 할 기프트가 팩 풀에 있음 | 게임 변경일 수도 있음 — 근거를 확인하고 불변식을 고칠지 결정 |
| `recipe R has ingredient == result` | 레시피 순환 | `requiredEgoGiftIds` 대신 a/b/c를 읽었을 가능성 |
| `curated override references unknown id` | 오버라이드 파일의 오타 | id 확인 후 수정 |

불변식을 낮추는 것은 **게임이 실제로 바뀐 경우에만** 허용된다. 그때는 커밋 메시지에 근거(패치 노트, 정적 데이터 diff)를 남긴다.

## `[stale]` — 생성물이 원본보다 오래됨

`npm run data:build`를 돌리고 `git status`로 `public/data` 변경을 확인해 함께 커밋한다. CI도 같은 검사를 하므로 빼먹으면 PR이 빨개진다.

## 느슨한 모드

정적 데이터 없이 로컬라이제이션만으로 빌드했다면 등급·가격이 `null`이다. 이때는

```bash
npm run data:build -- --lenient && npm run data:validate -- --lenient
```

로 등급/가격 관련 검사를 경고로 내린다. 커밋에는 쓰지 말 것 — 앱이 반쪽 데이터로 배포된다.
