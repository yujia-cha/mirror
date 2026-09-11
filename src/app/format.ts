/**
 * Display helpers that turn game ids into localized text. Kept out of ui.tsx so that file exports
 * components only, which is what React Fast Refresh needs.
 */
import type { Enums, Keyword, Localized, StatusKeyword } from '../core/schema.ts';
import { pick, type Lang } from './i18n.ts';

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
