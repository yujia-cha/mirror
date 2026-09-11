import type { Difficulty } from '../schema.ts';
import type { GameData } from '../schema.ts';
import type { GameIndexes } from '../types.ts';

const MODES: Difficulty[] = ['normal', 'hard', 'parallel', 'extreme'];

/**
 * Build the lookup tables the planner needs. Called once per data load; everything here is
 * derived, so the planner itself stays free of scans.
 */
export function buildIndexes(data: GameData): GameIndexes {
  const giftById = new Map(data.gifts.map((g) => [g.id, g]));
  const packById = new Map(data.packs.map((p) => [p.id, p]));
  const identityById = new Map(data.identities.map((i) => [i.id, i]));
  const packs = data.packs.filter((p) => p.selectable);

  const packsByFloor = {} as Record<Difficulty, Map<number, number[]>>;
  for (const mode of MODES) {
    const byFloor = new Map<number, number[]>();
    for (const floor of data.rules.floors[mode]) {
      byFloor.set(
        floor,
        packs
          .filter((p) => p.availability[mode].includes(floor))
          .map((p) => p.id)
          .sort((a, b) => a - b),
      );
    }
    packsByFloor[mode] = byFloor;
  }

  const packsByGift = new Map<number, number[]>();
  for (const pack of packs) {
    for (const giftId of pack.giftPool) {
      const list = packsByGift.get(giftId);
      if (list) list.push(pack.id);
      else packsByGift.set(giftId, [pack.id]);
    }
  }
  for (const list of packsByGift.values()) list.sort((a, b) => a - b);

  /**
   * Gifts not worth routing for.
   *
   * The game's own split is what matters: a gift listed in no pack's 테마 팩 한정 set can drop from
   * any pack that carries it, so forcing a particular pack buys nothing — it is a reward-card and
   * shop matter, not a route matter. The share is a floor, not a ceiling: a non-exclusive gift that
   * only a handful of small-pool packs carry (the 거울굴절철도 packs hold 18 gifts each) is rare
   * enough that the route should still aim at it.
   */
  const minPacks = Math.ceil(packs.length * data.rules.generalGiftPackShare);
  const freelyAvailableGifts = new Set<number>();
  for (const [giftId, list] of packsByGift) {
    if (giftById.get(giftId)?.acquisition.kind !== 'general') continue;
    if (list.length >= minPacks) freelyAvailableGifts.add(giftId);
  }

  return { giftById, packById, identityById, packs, packsByFloor, packsByGift, freelyAvailableGifts };
}
