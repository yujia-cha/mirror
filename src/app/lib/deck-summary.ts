import type { Enums } from '../../core/schema.ts';
import type { DeckStats } from '../../core/types.ts';
import { factionName, keywordName } from '../format.ts';
import type { Lang } from '../i18n.ts';

export interface SummaryChip {
  label: string;
  count: number;
  /** The same count over the whole formation, for a tooltip. */
  formation: number;
}

/** Keyword counts of the deployed party, then factions two or more of them share. */
export function deckSummaryChips(stats: DeckStats, enums: Enums, lang: Lang): SummaryChip[] {
  const chips: SummaryChip[] = [];
  const keywords = Object.entries(stats.keywordCounts.deployed)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0]));
  for (const [keyword, n] of keywords) {
    chips.push({
      label: keywordName(keyword as never, enums, lang),
      count: n ?? 0,
      formation: stats.keywordCounts.formation[keyword as never] ?? 0,
    });
  }
  const factions = Object.entries(stats.factionCounts.deployed)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4);
  for (const [faction, n] of factions) {
    chips.push({ label: factionName(faction, enums, lang), count: n, formation: stats.factionCounts.formation[faction] ?? 0 });
  }
  return chips;
}
