/**
 * What the app hands the planner. The wanted list carries a per-gift priority: a gift marked
 * 반드시 is `required` (the search satisfies those first), a normal one is best-effort, and a
 * given-up (포기) one stays selected but is left out of the plan until the user restores it.
 */
import type { PlanInput, PlanOptions, WantedGift } from '../../core/types.ts';

export type Priority = 'must' | 'normal' | 'skip';
export type PriorityMap = Record<number, 'must' | 'skip'>;
/** Fusion results the user wants only as a whole: their ingredients are not goals of their own. */
export type FusionGoalMap = Record<number, 'resultOnly'>;

export type GiftStatus = 'got' | 'failed';

/** The run being played, as the player reports it. */
export interface RunState {
  active: boolean;
  /** The floor about to be entered. */
  currentFloor: number;
  /** floor -> pack entered there. */
  visits: Record<number, number>;
  giftStatus: Record<number, GiftStatus>;
}

export function priorityOf(priority: PriorityMap, giftId: number): Priority {
  return priority[giftId] ?? 'normal';
}

export function plannedGifts(wanted: number[], priority: PriorityMap, fusionGoal: FusionGoalMap = {}): WantedGift[] {
  return wanted
    .filter((id) => priorityOf(priority, id) !== 'skip')
    .map((id) => ({
      giftId: id,
      required: priorityOf(priority, id) === 'must',
      ...(fusionGoal[id] === 'resultOnly' ? { ingredientsAsGoals: false } : {}),
    }));
}

export function skippedGifts(wanted: number[], priority: PriorityMap): number[] {
  return wanted.filter((id) => priorityOf(priority, id) === 'skip');
}

export function planInputFor(state: {
  deck: number[];
  deployed: number[];
  wanted: number[];
  priority: PriorityMap;
  options: PlanOptions;
  fusionGoal?: FusionGoalMap;
  run?: RunState;
}): PlanInput {
  const run = state.run;
  // A run in progress pins the packs already entered, moves the plan to the current floor, and
  // settles the gifts the player has reported as collected or missed.
  const progress: Partial<PlanOptions> =
    run && run.active
      ? {
          pinnedPacks: { ...state.options.pinnedPacks, ...run.visits },
          currentFloor: run.currentFloor,
          ownedGifts: Object.entries(run.giftStatus).filter(([, s]) => s === 'got').map(([id]) => Number(id)),
          unobtainableGifts: Object.entries(run.giftStatus).filter(([, s]) => s === 'failed').map(([id]) => Number(id)),
        }
      : { currentFloor: 1, ownedGifts: [], unobtainableGifts: [] };
  return {
    deck: state.deck,
    wanted: plannedGifts(state.wanted, state.priority, state.fusionGoal ?? {}),
    options: { ...state.options, ...progress, deployed: state.deployed },
  };
}
