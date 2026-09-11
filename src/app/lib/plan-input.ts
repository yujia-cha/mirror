/**
 * What the app hands the planner. The wanted list carries a per-gift priority: a gift marked
 * 반드시 is `required` (the search satisfies those first), a normal one is best-effort, and a
 * given-up (포기) one stays selected but is left out of the plan until the user restores it.
 */
import type { PlanInput, PlanOptions, WantedGift } from '../../core/types.ts';

export type Priority = 'must' | 'normal' | 'skip';
export type PriorityMap = Record<number, 'must' | 'skip'>;

export function priorityOf(priority: PriorityMap, giftId: number): Priority {
  return priority[giftId] ?? 'normal';
}

export function plannedGifts(wanted: number[], priority: PriorityMap): WantedGift[] {
  return wanted.filter((id) => priorityOf(priority, id) !== 'skip').map((id) => ({ giftId: id, required: priorityOf(priority, id) === 'must' }));
}

export function skippedGifts(wanted: number[], priority: PriorityMap): number[] {
  return wanted.filter((id) => priorityOf(priority, id) === 'skip');
}

export function planInputFor(state: { deck: number[]; deployed: number[]; wanted: number[]; priority: PriorityMap; options: PlanOptions }): PlanInput {
  return {
    deck: state.deck,
    wanted: plannedGifts(state.wanted, state.priority),
    options: { ...state.options, deployed: state.deployed },
  };
}
