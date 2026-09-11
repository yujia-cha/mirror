---
name: route-debug
description: Reproduce and diagnose a route the planner got wrong — an unresolved gift, a surprising pack choice, a missing fusion step, slow planning — and turn it into a regression test. Use when someone reports a bad or confusing route.
---

# 루트 디버깅

## 1. CLI로 재현

```bash
npm run route -- --deck 10101,10203,10312,10403,10505,10601 \
                 --want 9088,9280 --floors 1-5 --difficulty hard
```

옵션: `--floors 1-5|1-10|1-15`, `--difficulty normal|hard`, `--observe N`(기프트 관측 수), `--json`(RoutePlan 원본), `--explain`(층별 선택 이유와 대안 팩), `--trace`(탐색 노드 수·가지치기 통계).

UI에서 온 제보라면 공유 URL을 그대로 넘길 수 있다: `npm run route -- --share '#s=...'`.

## 2. 증상별 점검 순서

**기프트가 `unresolved`로 남는다** — `reason`을 먼저 본다.

| reason | 의미 | 확인할 곳 |
|---|---|---|
| `no-pack-in-range` | 그 기프트를 주는 팩이 계획 층 범위에 없음 | `--floors`를 넓혀 재현되는지. 팩이 Hard 전용/EXTREME 전용인지 |
| `pack-conflict` | 두 전용 기프트가 같은 층만 쓸 수 있음 | 관측·평행중첩으로 풀리는지. 실제로 한 런에 둘 다 불가할 수 있다 |
| `fusion-ingredient-unresolved` | 재료 중 하나가 안 잡힘 | 재료를 `--want`에 직접 넣어 어느 재료가 문제인지 좁힌다 |
| `condition-unmet` | 덱이 조건을 못 채움 | 경고일 뿐 배정은 된다. 덱 키워드 도출이 맞는지 확인 |

**팩 선택이 이상하다** — `--explain`으로 그 층의 후보와 점수를 본다. 목적 함수의 순서(미커버 → 팩 수 → 별빛 → 재료 조기 확보 → 키워드 → id)를 기억하고, 점수가 같은데 다른 팩이 나오면 tiebreaker 버그다.

**조합 단계가 빠졌다** — 재료가 마지막 층에서만 나오면 합성할 기회가 없다. `fusions[].earliestFloor`를 확인한다.

**느리다** — `--trace`의 노드 수를 본다. 상한(20만)에 닿아 `search-capped` 경고가 붙었다면 후보 가지치기를 손볼 대상이다.

## 3. 회귀 테스트로 고정

고친 뒤에는 같은 입력을 `src/core/router/__tests__/scenarios.test.ts`에 추가한다.

```ts
it('검계 덱은 본국검보를 위해 Hard 5층 교본을 배정한다', () => {
  const plan = planRoute(
    { deck: BLADE_DECK, wanted: [{ giftId: 9280, required: true }], options: hardFloors(5) },
    indexes,
  );
  expect(plan.floors.find((f) => f.floor === 5)?.pack).toBe(1025);
  expect(plan.unresolved).toEqual([]);
});
```

버그가 "잘못된 팩을 골랐다"였다면 `expect(...).toBe(packId)`로, "설명이 틀렸다"였다면 `--explain` 출력 스냅샷으로 고정한다. 스냅샷은 게임 데이터가 바뀌면 깨지므로, 데이터에 의존하지 않는 단정이 가능하면 그쪽을 쓴다.
