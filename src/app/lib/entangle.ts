/**
 * Two fusion goals can want the same ingredient, and the shop consumes it — fusing one leaves the
 * other short. The planner counts that (`expandRequirements` keys a requirement by result), but
 * nothing told the player, so this marks such goals **얽힘** and names what they share. It never
 * blocks a choice: picking the ingredient up twice satisfies both.
 */
import type { Gift } from '../../core/schema.ts';
import { chooseRecipe } from '../../core/index.ts';
import type { GameIndexes } from '../../core/types.ts';

export interface Entanglement {
  /** The other goal this one shares ingredients with. */
  other: number;
  /** The ingredients both of them consume. */
  shared: number[];
}

/** Every gift consumed on the way to `gift`, its sub-fusions included. */
export function ingredientsOf(gift: Gift, indexes: GameIndexes, maxShopSlots: number): Set<number> {
  const seen = new Set<number>();
  const walk = (current: Gift): void => {
    // A mixed recipe (달의 기억) picks from pools, so every candidate counts as possibly consumed.
    const direct = chooseRecipe(current, indexes, maxShopSlots) ?? (current.fusion?.mixed ? [...current.fusion.mixed.aPool, ...current.fusion.mixed.bPool] : null);
    if (!direct) return;
    for (const id of direct) {
      if (seen.has(id)) continue;
      seen.add(id);
      const child = indexes.giftById.get(id);
      if (child) walk(child);
    }
  };
  walk(gift);
  return seen;
}

/**
 * Which of the chosen gifts share ingredients, keyed by gift id. A gift that is itself an
 * ingredient of another is left out: the recipe already says so, and the list would read as a
 * conflict where there is none.
 */
export function entanglements(wanted: readonly number[], indexes: GameIndexes, maxShopSlots: number): Map<number, Entanglement[]> {
  const sets = new Map<number, Set<number>>();
  for (const id of wanted) {
    const gift = indexes.giftById.get(id);
    if (!gift?.fusion) continue;
    const ingredients = ingredientsOf(gift, indexes, maxShopSlots);
    if (ingredients.size > 0) sets.set(id, ingredients);
  }
  const found = new Map<number, Entanglement[]>();
  const ids = [...sets.keys()].sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const [a, b] = [ids[i]!, ids[j]!];
      const left = sets.get(a)!;
      const right = sets.get(b)!;
      if (left.has(b) || right.has(a)) continue;
      const shared = [...left].filter((id) => right.has(id)).sort((x, y) => x - y);
      if (shared.length === 0) continue;
      found.set(a, [...(found.get(a) ?? []), { other: b, shared }]);
      found.set(b, [...(found.get(b) ?? []), { other: a, shared }]);
    }
  }
  return found;
}

/** Why a gift cannot be chosen while the current goals stand. */
export interface Block {
  /** `included`: some goal's recipe already consumes it. `entangled`: it would eat a goal's ingredient. */
  reason: 'included' | 'entangled';
  /** The chosen goal that blocks it. */
  by: number;
}

/**
 * Which gifts the current goals rule out.
 *
 * Two rules, both about the same thing — a gift the player cannot meaningfully add on top of what
 * they already chose:
 *
 * - **포함**: every gift in a goal's recipe tree. Choosing 데스페라도 already carries 노이즈 섞인
 *   무전기, and the two are not linked by `upgradeOf` (그 사슬은 같은 키워드만 잇는다), so the tile
 *   would otherwise stay pickable and read as a second, separate goal.
 * - **얽힘**: a fusion that eats an ingredient one of the goals eats. The shop consumes it, so the
 *   second fusion would come up short.
 *
 * Only unchosen gifts are blocked: a goal the player already picked stays theirs to drop.
 */
export function blockedGifts(wanted: readonly number[], indexes: GameIndexes, maxShopSlots: number): Map<number, Block> {
  const chosen = new Set(wanted);
  const sets = new Map<number, Set<number>>();
  const ingredients = (id: number): Set<number> => {
    const known = sets.get(id);
    if (known) return known;
    const gift = indexes.giftById.get(id);
    const set = gift?.fusion ? ingredientsOf(gift, indexes, maxShopSlots) : new Set<number>();
    sets.set(id, set);
    return set;
  };

  const blocked = new Map<number, Block>();
  for (const goal of [...wanted].sort((a, b) => a - b)) {
    for (const id of ingredients(goal)) {
      if (chosen.has(id) || blocked.has(id)) continue;
      blocked.set(id, { reason: 'included', by: goal });
    }
  }

  for (const gift of indexes.giftById.values()) {
    if (!gift.fusion || chosen.has(gift.id) || blocked.has(gift.id)) continue;
    const mine = ingredients(gift.id);
    if (mine.size === 0) continue;
    for (const goal of [...wanted].sort((a, b) => a - b)) {
      const theirs = ingredients(goal);
      // One containing the other is a recipe, not a clash; the 포함 pass above already spoke.
      if (theirs.size === 0 || mine.has(goal) || theirs.has(gift.id)) continue;
      if (![...mine].some((id) => theirs.has(id))) continue;
      blocked.set(gift.id, { reason: 'entangled', by: goal });
      break;
    }
  }
  return blocked;
}
