/**
 * What an unresolved gift needs from the options. The planner reports the reason; this works out
 * the smallest option change that could help, so the button says "5층까지" rather than jumping to
 * 평행중첩 (and forcing Hard) when the pack only needed floor 4.
 */
import type { Gift, ThemePack } from '../../core/schema.ts';
import type { PlanOptions, Unresolved } from '../../core/types.ts';

export type ActionKind = 'switchHard' | 'extendFloors' | 'observeMore';

export interface UnresolvedAction {
  kind: ActionKind;
  /** The floor a floor extension targets; only for `extendFloors`. */
  floor?: number;
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
  if ((entry.reason === 'no-pack-in-range' || entry.reason === 'pack-conflict') && options.giftObservationMax < 3) {
    out.push({ kind: 'observeMore', patch: { giftObservationMax: options.giftObservationMax + 1 } });
  }
  return out;
}
