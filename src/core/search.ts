import type { Difficulty, Rules } from './schema.ts';
import type { GameIndexes, PlanOptions, Requirement } from './types.ts';

/** Which run mode a floor is played in, given the single Hard switch point. */
export function modeForFloor(floor: number, options: PlanOptions): Difficulty {
  if (floor >= 11) return 'extreme';
  if (floor >= 6) return 'parallel';
  if (options.hardFromFloor !== null && floor >= options.hardFromFloor) return 'hard';
  return 'normal';
}

export interface Slot {
  floor: number;
  mode: Difficulty;
  packId: number;
}

export interface SearchInput {
  requirements: Requirement[];
  floors: number[];
  options: PlanOptions;
  rules: Rules;
  indexes: GameIndexes;
  /** Hard node cap; when it trips the best greedy result so far is returned. */
  nodeCap?: number;
}

export interface SearchResult {
  /** floor -> packId for the packs the plan forces. */
  assignment: Map<number, number>;
  /** giftId -> the floor that supplies it. */
  supplier: Map<number, number>;
  unresolvedGiftIds: number[];
  nodes: number;
  capped: boolean;
}

interface Candidate {
  giftId: number;
  required: boolean;
  slots: Slot[];
}

const DEFAULT_NODE_CAP = 200_000;

/**
 * Assign theme packs to floors so that as many wanted gifts as possible are obtainable.
 *
 * The search is over requirements rather than floors: each requirement has a small set of
 * (floor, pack) slots that can supply it, and one pack often supplies several requirements. That
 * keeps the branching factor at "slots per gift" (usually under ten) instead of "packs per floor".
 *
 * Constraints enforced here:
 *   - one pack per floor, and a pack cannot be visited twice in a run
 *   - a floor only accepts packs available in that floor's mode (which encodes Hard-only packs,
 *     평행중첩 and EXTREME)
 *   - pinned floors keep their pack; banned packs are never used
 */
export function assignPacks(input: SearchInput): SearchResult {
  const { requirements, floors, options, indexes } = input;
  const nodeCap = input.nodeCap ?? DEFAULT_NODE_CAP;
  const banned = new Set(options.bannedPacks);

  const pinned = new Map<number, number>();
  for (const [floorText, packId] of Object.entries(options.pinnedPacks)) {
    const floor = Number(floorText);
    if (floors.includes(floor) && !banned.has(packId)) pinned.set(floor, packId);
  }

  // Slots per requirement, skipping gifts that need no routing at all.
  const candidates: Candidate[] = [];
  const unresolvedGiftIds: number[] = [];

  for (const requirement of requirements) {
    if (requirement.via !== 'route') continue;
    const packIds = indexes.packsByGift.get(requirement.giftId) ?? [];
    const slots: Slot[] = [];
    for (const floor of floors) {
      const mode = modeForFloor(floor, options);
      const available = indexes.packsByFloor[mode].get(floor) ?? [];
      for (const packId of packIds) {
        if (banned.has(packId)) continue;
        if (!available.includes(packId)) continue;
        const pinnedHere = pinned.get(floor);
        if (pinnedHere !== undefined && pinnedHere !== packId) continue;
        slots.push({ floor, mode, packId });
      }
    }
    if (slots.length === 0) {
      unresolvedGiftIds.push(requirement.giftId);
      continue;
    }
    candidates.push({ giftId: requirement.giftId, required: requirement.required, slots });
  }

  // Most constrained first: fewest slots, required before optional, then id for determinism.
  candidates.sort(
    (a, b) =>
      Number(b.required) - Number(a.required) || a.slots.length - b.slots.length || a.giftId - b.giftId,
  );

  const best = {
    missedRequired: Number.POSITIVE_INFINITY,
    missedOptional: Number.POSITIVE_INFINITY,
    packCount: Number.POSITIVE_INFINITY,
    floorSum: Number.POSITIVE_INFINITY,
    assignment: new Map<number, number>(),
    supplier: new Map<number, number>(),
    missed: [] as number[],
  };

  let nodes = 0;
  let capped = false;

  const assignment = new Map<number, number>(pinned);
  const usedPacks = new Set<number>(pinned.values());
  const supplier = new Map<number, number>();
  const missed: number[] = [];

  // Counters kept in step with the DFS stack: recomputing them per node was the hot spot.
  let missedRequired = 0;
  let missedOptional = 0;
  // Pinned floors are part of the plan from the start, so they seed the floor total.
  let floorSum = [...pinned.keys()].reduce((sum, floor) => sum + floor, 0);

  const score = (): {
    missedRequired: number;
    missedOptional: number;
    packCount: number;
    floorSum: number;
  } => ({ missedRequired, missedOptional, packCount: assignment.size, floorSum });

  const better = (a: ReturnType<typeof score>): boolean =>
    a.missedRequired < best.missedRequired ||
    (a.missedRequired === best.missedRequired &&
      (a.missedOptional < best.missedOptional ||
        (a.missedOptional === best.missedOptional &&
          (a.packCount < best.packCount || (a.packCount === best.packCount && a.floorSum < best.floorSum)))));

  const record = (): void => {
    const current = score();
    if (!better(current)) return;
    best.missedRequired = current.missedRequired;
    best.missedOptional = current.missedOptional;
    best.packCount = current.packCount;
    best.floorSum = current.floorSum;
    best.assignment = new Map(assignment);
    best.supplier = new Map(supplier);
    best.missed = [...missed];
  };

  const dfs = (index: number): void => {
    if (capped) return;
    nodes += 1;
    if (nodes > nodeCap) {
      capped = true;
      return;
    }

    if (index >= candidates.length) {
      record();
      return;
    }

    /**
     * Prune against the best complete plan found so far. Every term only grows as the search
     * descends — misses are never taken back, floors are never closed — so a partial plan already
     * worse on an earlier term can never recover.
     */
    const partial = score();
    if (partial.missedRequired > best.missedRequired) return;
    if (partial.missedRequired === best.missedRequired) {
      if (partial.missedOptional > best.missedOptional) return;
      if (partial.missedOptional === best.missedOptional) {
        if (partial.packCount > best.packCount) return;
        if (partial.packCount === best.packCount && partial.floorSum > best.floorSum) return;
      }
    }

    const candidate = candidates[index]!;

    // Reusing a floor already assigned to a pack that supplies this gift is always at least as
    // good as opening a new floor, so try those first.
    const reuse = candidate.slots.filter((slot) => assignment.get(slot.floor) === slot.packId);
    const fresh = candidate.slots.filter(
      (slot) => !assignment.has(slot.floor) && !usedPacks.has(slot.packId),
    );

    for (const slot of [...reuse, ...fresh]) {
      const openedFloor = !assignment.has(slot.floor);
      if (openedFloor) {
        assignment.set(slot.floor, slot.packId);
        usedPacks.add(slot.packId);
        floorSum += slot.floor;
      }
      supplier.set(candidate.giftId, slot.floor);
      dfs(index + 1);
      supplier.delete(candidate.giftId);
      if (openedFloor) {
        assignment.delete(slot.floor);
        usedPacks.delete(slot.packId);
        floorSum -= slot.floor;
      }
      if (capped) return;
    }

    // Giving up on this gift is also a branch: two exclusives can be mutually exclusive.
    missed.push(candidate.giftId);
    if (candidate.required) missedRequired += 1;
    else missedOptional += 1;
    dfs(index + 1);
    if (candidate.required) missedRequired -= 1;
    else missedOptional -= 1;
    missed.pop();
  };

  dfs(0);

  return {
    assignment: best.assignment,
    supplier: best.supplier,
    unresolvedGiftIds: [...unresolvedGiftIds, ...best.missed].sort((a, b) => a - b),
    nodes,
    capped,
  };
}

/**
 * Starlight for forcing `count` packs through theme-pack observation.
 * The cost rises by `step` per use in a run, and by a further multiplier for a pack never visited.
 */
export function observationCost(count: number, rules: Rules, assumeUnvisited: boolean): number {
  const { base, step, unvisitedMultiplier } = rules.themeObservation;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const cost = base + step * i;
    total += assumeUnvisited ? Math.ceil(cost * unvisitedMultiplier) : cost;
  }
  return total;
}
