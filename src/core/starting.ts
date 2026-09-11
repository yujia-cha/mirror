import type { Keyword, Rules } from './schema.ts';
import type { DeckStats, GameIndexes, Requirement } from './types.ts';
import { dominantKeyword } from './deck.ts';
import { scarcity } from './requirements.ts';

export interface StartSelection {
  keyword: Keyword | null;
  startGift: number | null;
  observed: number[];
  starlight: number;
}

/**
 * Decide what the run starts with.
 *
 * Two separate mechanics:
 *  - the starting keyword pool hands over one gift for free, chosen from three per keyword;
 *  - "E.G.O 기프트 관측" spends starlight to add more, and cannot produce fusion results.
 *
 * Both are spent on the hardest-to-route requirements, since everything else can be picked up
 * along the way.
 */
export function chooseStart(
  requirements: Requirement[],
  indexes: GameIndexes,
  rules: Rules,
  stats: DeckStats,
  requestedKeyword: Keyword | 'auto',
  observationMax: number,
): StartSelection {
  const keyword: Keyword | null = requestedKeyword === 'auto' ? dominantKeyword(stats) : requestedKeyword;

  const wantedIds = new Set(requirements.map((r) => r.giftId));

  // The free pick only works if one of this keyword's three candidates is actually wanted.
  const pool = keyword ? (rules.startGift.poolsByKeyword[keyword] ?? []) : [];
  const startGift =
    rules.startGift.pickCount > 0
      ? ([...pool]
          .filter((id) => wantedIds.has(id))
          .sort((a, b) => scarcity(a, indexes) - scarcity(b, indexes))[0] ?? null)
      : null;

  // Observation candidates: wanted gifts that are not fusion results and not already the free pick.
  const candidates = requirements
    .filter((r) => r.giftId !== startGift)
    .filter((r) => {
      const gift = indexes.giftById.get(r.giftId);
      if (!gift) return false;
      if (!rules.giftObservation.fusionResultsAllowed && gift.acquisition.kind === 'fusionOnly') return false;
      return true;
    })
    // Hardest first: fewest packs that can supply it, required before optional, then id.
    .sort(
      (a, b) =>
        scarcity(a.giftId, indexes) - scarcity(b.giftId, indexes) ||
        Number(b.required) - Number(a.required) ||
        a.giftId - b.giftId,
    );

  const max = Math.min(observationMax, rules.giftObservation.max);
  const observed = candidates.slice(0, Math.max(0, max)).map((r) => r.giftId);

  const costTable = rules.giftObservation.costTable;
  const starlight = observed.length === 0 ? 0 : (costTable[observed.length - 1] ?? 0);

  return { keyword, startGift, observed: observed.sort((a, b) => a - b), starlight };
}
