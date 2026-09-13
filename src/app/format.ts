/**
 * Display helpers that turn game ids into localized text. Kept out of ui.tsx so that file exports
 * components only, which is what React Fast Refresh needs.
 */
import type { Enums, Identity, Keyword, Localized, StatusKeyword } from '../core/schema.ts';
import { pick, t, type Lang } from './i18n.ts';

/** Faction ids localized through enums, so the planner never carries display names. */
export function factionName(id: string, enums: Enums, lang: Lang): string {
  const entry = enums.factions.find((f) => f.id === id);
  return entry ? pick(entry.name, lang) : id;
}

export function keywordName(id: Keyword | StatusKeyword, enums: Enums, lang: Lang): string {
  const entry = enums.keywords.find((k) => k.id === id);
  return entry ? pick(entry.name, lang) : id;
}

/**
 * Replace the `[Token]` status references the game embeds in effect text with their Korean or
 * English names, and strip the rich-text markup that survived the data build.
 */
export function renderEffect(text: Localized, enums: Enums, lang: Lang): string {
  let out = pick(text, lang);
  for (const keyword of enums.keywords) {
    out = out.split(`[${keyword.id}]`).join(pick(keyword.name, lang) || keyword.id);
  }
  return out.replace(/<[^>]*>/g, '');
}

/**
 * How one identity's keyword reads on its chip: 「충전」 for the base keyword, 「충전(특수)」 when
 * its skills also use the 특수 variant (생체 재료), 「특수 출혈」 when they use only the variant (못).
 * The count of skills is deliberately not shown — the deck-level chips carry the numbers.
 */
export function identityKeywordLabel(
  keyword: StatusKeyword,
  info: Identity['keywords'][StatusKeyword],
  enums: Enums,
  lang: Lang,
): { label: string; title: string } {
  const name = keywordName(keyword, enums, lang);
  if (!info || info.specialSkills === 0) return { label: name, title: t('deckKeywordSkills', lang, { keyword: name }) };
  if (info.skills === 0) {
    return { label: t('deckKeywordSpecialOnly', lang, { keyword: name }), title: t('deckKeywordSpecialOnlyHint', lang, { keyword: name }) };
  }
  return { label: t('deckKeywordSpecial', lang, { keyword: name }), title: t('deckKeywordSpecialHint', lang, { keyword: name }) };
}
