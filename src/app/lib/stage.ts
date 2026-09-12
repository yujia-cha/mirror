/**
 * What the run stage shows for a floor, derived from the plan and the run record. Pure, so the
 * stage can be reasoned about without a DOM: which packs the route lets the player enter here,
 * what a pack drops that nothing else does, and which goal gifts count as missed on leaving.
 */
import type { Difficulty, GameData } from '../../core/schema.ts';
import type { GameIndexes, RoutePlan } from '../../core/types.ts';
import { APP_LAST_FLOOR, RUN_DONE_FLOOR } from '../store.ts';
import type { GiftStatus, RunState } from './plan-input.ts';

/** The app plays floors 1-5 on Hard, 6-10 in 평행중첩 and 11-15 on EXTREME. */
export function bandMode(floor: number): Extract<Difficulty, 'hard' | 'parallel' | 'extreme'> {
  return floor >= 11 ? 'extreme' : floor >= 6 ? 'parallel' : 'hard';
}

export type StageMode = 'entered' | 'undecided' | 'skipped' | 'done';

/** Entered: a pack is recorded; undecided: the frontier; skipped: passed without a pack; done: the run is over. */
export function stageModeFor(run: Pick<RunState, 'currentFloor' | 'visits'>, floor: number): StageMode {
  if (run.visits[floor] !== undefined) return 'entered';
  if (run.currentFloor >= RUN_DONE_FLOOR && floor >= APP_LAST_FLOOR) return 'done';
  if (floor === run.currentFloor) return 'undecided';
  return floor < run.currentFloor ? 'skipped' : 'undecided';
}

export interface EnterablePack {
  packId: number;
  /** The planner put the pack on exactly this floor. */
  recommended: boolean;
  /** The floors the pack could sit on instead, per the plan. */
  window: { from: number; to: number };
}

/** Route packs the player may enter on `floor`: the one planned here first, then those whose window covers it. */
export function enterablePacks(plan: RoutePlan | null, floor: number): EnterablePack[] {
  if (!plan) return [];
  const out: EnterablePack[] = [];
  for (const entry of plan.floors) {
    if (entry.packId === null || entry.passed) continue;
    const window = entry.window ?? { from: entry.floor, to: entry.floor };
    if (floor < window.from || floor > window.to) continue;
    out.push({ packId: entry.packId, recommended: entry.floor === floor, window });
  }
  return out.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.packId - b.packId);
}

/** Every selectable pack the game can offer on `floor`. */
export function packsOfferedOn(indexes: GameIndexes, floor: number): number[] {
  return indexes.packsByFloor[bandMode(floor)].get(floor) ?? [];
}

/**
 * Gifts obtainable only from a given pack: its exclusive pool plus the clear reward its boss
 * hands out (EXTREME packs). Built once per data set.
 */
export function exclusivesIndex(data: GameData, indexes: GameIndexes): (packId: number) => number[] {
  const rewards = new Map<number, number[]>();
  for (const gift of data.gifts) {
    const packId = gift.acquisition.clearRewardOf;
    if (packId === null || packId === undefined) continue;
    rewards.set(packId, [...(rewards.get(packId) ?? []), gift.id]);
  }
  const cache = new Map<number, number[]>();
  return (packId) => {
    const cached = cache.get(packId);
    if (cached) return cached;
    const pack = indexes.packById.get(packId);
    const ids = [...new Set([...(pack?.exclusiveGifts ?? []), ...(rewards.get(packId) ?? [])])].sort((a, b) => a - b);
    cache.set(packId, ids);
    return ids;
  };
}

/**
 * Goal gifts an entered pack should have dropped but which the player never marked: they are
 * missed once the floor is left. Gifts already recorded either way are left alone.
 */
export function autoFailedFor(
  packId: number,
  goals: ReadonlySet<number>,
  giftStatus: Record<number, GiftStatus>,
  exclusivesOf: (packId: number) => number[],
): number[] {
  return exclusivesOf(packId).filter((id) => goals.has(id) && giftStatus[id] === undefined);
}
