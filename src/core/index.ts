/**
 * The route planner.
 *
 * Pure TypeScript: no React, no DOM, no network. It runs in the browser, in Vitest and in
 * scripts/route-cli.ts, and the same input always produces the same output.
 */
import type { GameData } from './schema.ts';
import type {
  FloorPlan,
  FusionStep,
  GameIndexes,
  PlanInput,
  PlanOptions,
  PlanWarning,
  Requirement,
  RoutePlan,
  Unresolved,
} from './types.ts';
import { analyseDeck, evaluateConditions } from './deck.ts';
import { expandRequirements, scarcity } from './requirements.ts';
import { assignPacks, modeForFloor, observationCost } from './search.ts';
import { chooseStart } from './starting.ts';

export { buildIndexes } from './data/indexes.ts';
export { analyseDeck, dominantKeyword, evaluateConditions } from './deck.ts';
export { expandRequirements, scarcity } from './requirements.ts';
export { assignPacks, modeForFloor, observationCost } from './search.ts';
export { chooseStart } from './starting.ts';
export * from './types.ts';
export * from './schema.ts';

/** Default options: one Normal clear of floors 1-5 with three observed gifts. */
export function defaultOptions(): PlanOptions {
  return {
    lastFloor: 5,
    hardFromFloor: null,
    startKeyword: 'auto',
    giftObservationMax: 3,
    assumeUnvisitedPacks: false,
    pinnedPacks: {},
    bannedPacks: [],
  };
}

/**
 * Planning past floor 5 requires 평행중첩, which in turn requires floors 1-5 cleared on Hard.
 * Rather than produce an impossible plan, the options are corrected and the change is reported.
 */
function normaliseOptions(
  options: PlanOptions,
  data: GameData,
): { options: PlanOptions; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  let next = { ...options };

  if (next.lastFloor > 5 && data.rules.difficulty.parallelRequiresAllHard && next.hardFromFloor !== 1) {
    next = { ...next, hardFromFloor: 1 };
    warnings.push({
      code: 'parallel-requires-hard',
      detail: {
        ko: '평행중첩(6층 이상)은 1~5층을 전부 Hard로 클리어해야 들어갈 수 있어, 1층부터 Hard로 계획했습니다.',
        en: 'Floors 6+ need floors 1-5 cleared on Hard, so the plan switches to Hard from floor 1.',
      },
    });
  }

  return { options: next, warnings };
}

function floorsFor(options: PlanOptions, data: GameData): number[] {
  const all = [...data.rules.floors.normal, ...data.rules.floors.parallel, ...data.rules.floors.extreme].sort(
    (a, b) => a - b,
  );
  return [...new Set(all)].filter((floor) => floor <= options.lastFloor);
}

export function planRoute(input: PlanInput, data: GameData, indexes: GameIndexes): RoutePlan {
  const startedAt = Date.now();
  const { options, warnings } = normaliseOptions(input.options, data);
  const floors = floorsFor(options, data);

  const stats = analyseDeck(input.deck, indexes, options.deployed);
  const unresolved: Unresolved[] = [];

  // ---- 1. What do we actually have to obtain? -----------------------------
  const expansion = expandRequirements(input.wanted, indexes, stats, data.rules.fusion.maxShopSlots);
  unresolved.push(...expansion.unresolved);
  const requirements = expansion.requirements;

  // ---- 2. Gifts that need no routing -------------------------------------
  const generalDrops: number[] = [];
  for (const requirement of requirements) {
    const gift = indexes.giftById.get(requirement.giftId);
    if (!gift) continue;
    if (!gift.obtainable) {
      requirement.via = 'generalDrop';
      unresolved.push({
        giftId: requirement.giftId,
        reason: 'not-obtainable',
        detail: {
          ko: '이번 시즌에 획득할 수 없는 기프트입니다.',
          en: 'Not obtainable in the current season.',
        },
      });
      continue;
    }
    if (indexes.freelyAvailableGifts.has(requirement.giftId)) {
      requirement.via = 'generalDrop';
      generalDrops.push(requirement.giftId);
    }
  }

  // ---- 3. The free starting-keyword gift ----------------------------------
  const start = chooseStart(
    requirements.filter((r) => r.via === 'route'),
    indexes,
    data.rules,
    stats,
    options.startKeyword,
    // Observation is decided after the search (step 5); it is a fallback, not a default spend.
    0,
  );
  for (const requirement of requirements) {
    if (requirement.giftId === start.startGift) requirement.via = 'startGift';
  }

  // ---- 4. Hard-only gifts on a Normal-only plan ---------------------------
  const planIsHard = options.hardFromFloor !== null;
  for (const requirement of requirements.filter((r) => r.via === 'route')) {
    const gift = indexes.giftById.get(requirement.giftId);
    if (gift?.hardOnly && !planIsHard) {
      unresolved.push({
        giftId: requirement.giftId,
        reason: 'hard-only',
        detail: {
          ko: 'Hard 난이도에서만 얻을 수 있는 기프트입니다. 난이도를 Hard로 바꾸세요.',
          en: 'Obtainable on Hard difficulty only. Switch the plan to Hard.',
        },
      });
      requirement.via = 'generalDrop';
    }
  }

  // ---- 5. Assign packs to floors, then spend observation on what is left ---
  const runSearch = () =>
    assignPacks({
      requirements: requirements.filter((r) => r.via === 'route'),
      floors,
      options,
      rules: data.rules,
      indexes,
    });

  let search = runSearch();

  /**
   * Starlight observation is expensive, so it is used only for gifts the route could not reach —
   * typically two pack-exclusives that compete for the same floor. Non-fusion gifts only, and
   * hardest-first so the budget goes where routing cannot help.
   */
  const observed: number[] = [];
  if (search.unresolvedGiftIds.length > 0 && options.giftObservationMax > 0) {
    const budget = Math.min(options.giftObservationMax, data.rules.giftObservation.max);
    const eligible = search.unresolvedGiftIds
      .filter((giftId) => {
        const gift = indexes.giftById.get(giftId);
        if (!gift) return false;
        if (!data.rules.giftObservation.fusionResultsAllowed && gift.acquisition.kind === 'fusionOnly')
          return false;
        return true;
      })
      .sort((a, b) => scarcity(a, indexes) - scarcity(b, indexes) || a - b)
      .slice(0, budget);

    if (eligible.length > 0) {
      for (const giftId of eligible) {
        for (const requirement of requirements) {
          if (requirement.giftId === giftId) requirement.via = 'observation';
        }
        observed.push(giftId);
      }
      search = runSearch();
    }
  }

  start.observed = observed.sort((a, b) => a - b);
  start.starlight =
    observed.length === 0 ? 0 : (data.rules.giftObservation.costTable[observed.length - 1] ?? 0);

  for (const giftId of search.unresolvedGiftIds) {
    const gift = indexes.giftById.get(giftId);
    const packs = indexes.packsByGift.get(giftId) ?? [];
    const anySlot = packs.some((packId) =>
      floors.some((floor) =>
        (indexes.packsByFloor[modeForFloor(floor, options)].get(floor) ?? []).includes(packId),
      ),
    );
    unresolved.push({
      giftId,
      reason: anySlot ? 'pack-conflict' : 'no-pack-in-range',
      detail: anySlot
        ? {
            ko: '다른 전용 기프트와 층이 겹쳐 한 런에 같이 넣을 수 없습니다.',
            en: 'Its pack competes for the same floor as another wanted exclusive.',
          }
        : {
            ko: `${gift?.name.ko ?? giftId}를 주는 팩이 계획한 층 범위에 없습니다.`,
            en: 'No pack that supplies it appears within the planned floors.',
          },
    });
  }

  // ---- 6. Build the floor plan -------------------------------------------
  const pickupsByFloor = new Map<number, FloorPlan['pickups']>();
  for (const requirement of requirements) {
    if (requirement.via !== 'route') continue;
    const floor = search.supplier.get(requirement.giftId);
    if (floor === undefined) continue;
    const packId = search.assignment.get(floor);
    const pack = packId !== undefined ? indexes.packById.get(packId) : undefined;
    const list = pickupsByFloor.get(floor) ?? [];
    list.push({
      giftId: requirement.giftId,
      kind: pack?.exclusiveGifts.includes(requirement.giftId) ? 'exclusive' : 'pool',
      neededFor: requirement.neededFor,
    });
    pickupsByFloor.set(floor, list);
  }

  const forcedFloors = [...search.assignment.keys()].sort((a, b) => a - b);
  let observationIndex = 0;

  const floorPlans: FloorPlan[] = floors.map((floor): FloorPlan => {
    const mode = modeForFloor(floor, options);
    const packId = search.assignment.get(floor) ?? null;
    const pinned = options.pinnedPacks[floor] === packId && packId !== null;
    const pickups = (pickupsByFloor.get(floor) ?? []).sort((a, b) => a.giftId - b.giftId);

    const needsObservation = packId !== null && !pinned;
    const canObserve = mode !== 'extreme' || data.rules.difficulty.extremeAllowsObservation;
    const starlight =
      needsObservation && canObserve
        ? observationCost(observationIndex + 1, data.rules, options.assumeUnvisitedPacks) -
          observationCost(observationIndex, data.rules, options.assumeUnvisitedPacks)
        : 0;
    if (needsObservation && canObserve) observationIndex += 1;

    // Packs on this floor that could have supplied the same pickups.
    const alternatives =
      pickups.length > 0
        ? (indexes.packsByFloor[mode].get(floor) ?? [])
            .filter((candidate) => candidate !== packId)
            .filter((candidate) => {
              const pack = indexes.packById.get(candidate);
              return pack ? pickups.every((p) => pack.giftPool.includes(p.giftId)) : false;
            })
        : [];

    return {
      floor,
      mode,
      packId,
      reason: packId === null ? 'free' : pinned ? 'pinned' : 'required',
      pickups,
      observation: { needed: needsObservation, possible: canObserve, starlight },
      alternatives,
    };
  });

  // ---- 7. Schedule fusions ------------------------------------------------
  const obtainedAtFloor = new Map<number, number>();
  for (const requirement of requirements) {
    if (requirement.via === 'startGift' || requirement.via === 'observation') {
      obtainedAtFloor.set(requirement.giftId, 0);
    } else if (requirement.via === 'generalDrop') {
      obtainedAtFloor.set(requirement.giftId, floors[0] ?? 1);
    } else {
      const floor = search.supplier.get(requirement.giftId);
      if (floor !== undefined) obtainedAtFloor.set(requirement.giftId, floor);
    }
  }

  const fusions: FusionStep[] = [];
  for (const fusion of expansion.fusions) {
    const floorsNeeded = fusion.ingredients.map((id) => obtainedAtFloor.get(id));
    const unreachable = floorsNeeded.some((floor) => floor === undefined);
    const earliestFloor = unreachable ? 0 : Math.max(...(floorsNeeded as number[]), floors[0] ?? 1);
    const step: FusionStep = {
      result: fusion.result,
      ingredients: fusion.ingredients,
      earliestFloor,
      unreachable,
      exceedsShopSlots: fusion.ingredients.length > data.rules.fusion.maxShopSlots,
    };
    fusions.push(step);
    // A fusion result can itself be an ingredient, so it becomes available from that floor on.
    if (!unreachable) obtainedAtFloor.set(fusion.result, earliestFloor);
  }

  for (const fusion of fusions) {
    if (!fusion.unreachable) continue;
    const missing = fusion.ingredients.filter((id) => !obtainedAtFloor.has(id));
    unresolved.push({
      giftId: fusion.result,
      reason: 'fusion-ingredient-unresolved',
      detail: {
        ko: `재료 ${missing.join(', ')}를 구할 수 없어 조합할 수 없습니다.`,
        en: `Cannot be fused: ingredients ${missing.join(', ')} are not obtainable in this plan.`,
      },
    });
  }

  // ---- 8. Warnings --------------------------------------------------------
  const conditions = evaluateConditions(
    input.wanted.map((w) => w.giftId),
    stats,
    indexes,
  );

  const unmet = conditions.filter((c) => !c.satisfied);
  if (unmet.length > 0) {
    warnings.push({
      code: 'condition-unmet',
      giftIds: [...new Set(unmet.map((c) => c.giftId))].sort((a, b) => a - b),
      detail: {
        ko: `조건을 충족하지 못하는 기프트가 ${new Set(unmet.map((c) => c.giftId)).size}개 있습니다. 효과가 발동하지 않습니다.`,
        en: `${new Set(unmet.map((c) => c.giftId)).size} gift(s) will not activate with this deck.`,
      },
    });
  }

  if (generalDrops.length > 0) {
    warnings.push({
      code: 'general-drop-not-guaranteed',
      giftIds: [...new Set(generalDrops)].sort((a, b) => a - b),
      detail: {
        ko: '범용 기프트는 어느 팩에서나 나올 수 있을 뿐 확정 획득이 아닙니다. 상점과 새로고침을 함께 쓰세요.',
        en: 'General gifts can drop from any pack but are never guaranteed; use the shop and refreshes.',
      },
    });
  }

  const lateFusions = fusions.filter((f) => !f.unreachable && f.earliestFloor >= options.lastFloor);
  if (lateFusions.length > 0) {
    warnings.push({
      code: 'fusion-late',
      giftIds: lateFusions.map((f) => f.result),
      detail: {
        ko: '마지막 층에서야 재료가 모이는 조합이 있습니다. 그 층의 상점이나 휴식 노드를 반드시 들러야 합니다.',
        en: 'Some fusions only become possible on the final floor; you must reach a shop or rest node there.',
      },
    });
  }

  const slotHeavy = fusions.filter((f) => f.exceedsShopSlots);
  if (slotHeavy.length > 0) {
    warnings.push({
      code: 'fusion-slots',
      giftIds: slotHeavy.map((f) => f.result),
      detail: {
        ko: `재료가 ${data.rules.fusion.maxShopSlots}개를 넘어 일반 상점에서는 한 번에 조합할 수 없습니다. 하위 재료부터 조합하세요.`,
        en: `Needs more than ${data.rules.fusion.maxShopSlots} fusion slots, so fuse the sub-ingredients first.`,
      },
    });
  }

  if (stats.identitiesWithoutKeywords.length > 0) {
    warnings.push({
      code: 'identity-keywords-unknown',
      detail: {
        ko: `키워드를 확인할 수 없는 인격이 ${stats.identitiesWithoutKeywords.length}명 있어 조건 판정이 낮게 나올 수 있습니다.`,
        en: `${stats.identitiesWithoutKeywords.length} identity/identities have unknown keywords, so condition counts may be low.`,
      },
    });
  }

  if (start.observed.length > 0 && !data.rules.giftObservation.verified) {
    warnings.push({
      code: 'gift-observation-unverified',
      detail: {
        ko: '기프트 관측 별빛 비용표는 인게임 확인이 필요한 값입니다(구버전 기준).',
        en: 'The gift-observation starlight cost is taken from an older season and needs in-game confirmation.',
      },
    });
  }

  if (search.capped) {
    warnings.push({
      code: 'search-capped',
      detail: {
        ko: '탐색 한도에 도달해 최선에 가까운 결과만 보여 줍니다. 원하는 기프트를 줄이면 더 정확해집니다.',
        en: 'The search hit its node cap, so this is a near-best plan. Fewer wanted gifts will sharpen it.',
      },
    });
  }

  if (!planIsHard) {
    const hardOnlyPacks = requirements
      .filter((r) => r.via === 'route')
      .flatMap((r) => indexes.packsByGift.get(r.giftId) ?? [])
      .map((packId) => indexes.packById.get(packId))
      .filter((pack) => pack && pack.availability.normal.length === 0 && pack.availability.hard.length > 0);
    if (hardOnlyPacks.length > 0) {
      warnings.push({
        code: 'hard-required',
        detail: {
          ko: 'Hard에서만 등장하는 팩이 필요한 기프트가 있습니다. 난이도를 Hard로 올리면 루트가 넓어집니다.',
          en: 'Some wanted gifts only come from Hard-only packs; switching to Hard widens the route.',
        },
      });
    }
  }

  // ---- 9. Assemble -------------------------------------------------------
  const unresolvedIds = new Set(unresolved.map((u) => u.giftId));
  const coveredWanted = input.wanted.filter((w) => !unresolvedIds.has(w.giftId)).length;

  const starlight = start.starlight + floorPlans.reduce((sum, plan) => sum + plan.observation.starlight, 0);

  return {
    start: {
      keyword: start.keyword,
      startGift: start.startGift,
      observed: start.observed,
      starlight: start.starlight,
      starlightVerified: data.rules.giftObservation.verified,
    },
    floors: floorPlans,
    fusions,
    generalDrops: [...new Set(generalDrops)].sort((a, b) => a - b),
    conditions,
    unresolved: dedupeUnresolved(unresolved),
    warnings,
    stats: {
      requiredPacks: forcedFloors.length,
      starlight,
      coveredWanted,
      totalWanted: input.wanted.length,
      searchNodes: search.nodes,
      searchCapped: search.capped,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

function dedupeUnresolved(entries: Unresolved[]): Unresolved[] {
  const seen = new Set<string>();
  const out: Unresolved[] = [];
  for (const entry of entries) {
    const key = `${entry.giftId}:${entry.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.sort((a, b) => a.giftId - b.giftId || a.reason.localeCompare(b.reason));
}

/** Requirements with their final routing decision, for callers that want to show the breakdown. */
export function requirementSummary(requirements: Requirement[]): Record<Requirement['via'], number[]> {
  const out: Record<Requirement['via'], number[]> = {
    route: [],
    startGift: [],
    observation: [],
    generalDrop: [],
    fusion: [],
  };
  for (const requirement of requirements) out[requirement.via].push(requirement.giftId);
  for (const key of Object.keys(out) as Requirement['via'][]) out[key].sort((a, b) => a - b);
  return out;
}
