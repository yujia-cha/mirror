/**
 * What an unresolved gift needs from the options. The planner reports the reason; this works out
 * the smallest option change that could help, so the button says "5층까지" rather than jumping to
 * 평행중첩 (and forcing Hard) when the pack only needed floor 4.
 */
import type { Gift, Rules, ThemePack } from '../../core/schema.ts';
import type { PlanOptions, Unresolved } from '../../core/types.ts';
import { observable } from '../../core/index.ts';

export type ActionKind = 'switchHard' | 'extendFloors' | 'observeGift' | 'releaseObservations';

export interface UnresolvedAction {
  kind: ActionKind;
  /** The floor a floor extension targets; only for `extendFloors`. */
  floor?: number;
  /** The gift an observation action pins; only for `observeGift`. */
  giftId?: number;
  patch: Partial<PlanOptions>;
}

/** The end of the band a floor belongs to: 5, 10 or 15. */
export function bandEnd(floor: number): number {
  return floor <= 5 ? 5 : floor <= 10 ? 10 : 15;
}

/** The lowest floor any of the gift's packs is offered on, in the modes this plan can reach. */
export function lowestPackFloor(gift: Gift, packById: Map<number, ThemePack>, options: PlanOptions): number | null {
  const lowMode = options.hardFromFloor === null ? 'normal' : 'hard';
  let lowest: number | null = null;
  for (const packId of gift.acquisition.packs) {
    const pack = packById.get(packId);
    if (!pack) continue;
    const floors = [...pack.availability[lowMode], ...pack.availability.parallel, ...pack.availability.extreme];
    for (const floor of floors) if (lowest === null || floor < lowest) lowest = floor;
  }
  return lowest;
}

export function actionsFor(
  entry: Unresolved,
  gift: Gift | undefined,
  packById: Map<number, ThemePack>,
  options: PlanOptions,
  rules: Rules,
): UnresolvedAction[] {
  const out: UnresolvedAction[] = [];
  const extendTo = (floor: number): void => {
    const target = bandEnd(floor);
    if (target <= options.lastFloor) return;
    out.push({ kind: 'extendFloors', floor: target, patch: target > 5 ? { lastFloor: target, hardFromFloor: 1 } : { lastFloor: target } });
  };
  if (entry.reason === 'hard-only' && options.hardFromFloor === null) {
    out.push({ kind: 'switchHard', patch: { hardFromFloor: 1 } });
  }
  if (entry.reason === 'no-pack-in-range') {
    const lowest = gift ? lowestPackFloor(gift, packById, options) : null;
    if (lowest !== null && lowest > options.lastFloor) extendTo(lowest);
    else if (options.lastFloor < 15) extendTo(options.lastFloor + 1);
  }
  if (entry.reason === 'pack-conflict' && options.lastFloor < 15) extendTo(options.lastFloor + 1);
  // The planner already spends free observation slots on rescues, so this mostly matters when
  // every slot is pinned by the user: offer to pin this gift instead, or to let the planner choose.
  if (
    (entry.reason === 'no-pack-in-range' || entry.reason === 'pack-conflict') &&
    gift &&
    observable(gift, rules) &&
    !options.observedGifts.includes(gift.id)
  ) {
    if (options.observedGifts.length < rules.giftObservation.max) {
      out.push({ kind: 'observeGift', giftId: gift.id, patch: { observedGifts: [...options.observedGifts, gift.id] } });
    } else if (options.observedGifts.length > 0) {
      out.push({ kind: 'releaseObservations', patch: { observedGifts: [] } });
    }
  }
  return out;
}
