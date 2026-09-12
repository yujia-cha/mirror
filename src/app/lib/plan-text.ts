import type { Keyword } from '../../core/schema.ts';
import type { RoutePlan } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { segmentsFor, suggestedOrder } from './metro.ts';

/**
 * A Discord-friendly plain-text rendering of the plan, one line per metro segment: packs that
 * share a window are listed together in any order, partly overlapping windows carry the
 * suggested floors. Ids are localized by the callbacks. Only what the route decides is written.
 */
export function planToText(
  plan: RoutePlan,
  giftName: (id: number) => string,
  packName: (id: number) => string,
  keywordLabel: (id: Keyword) => string,
  lang: Lang,
  dropped: number[] = [],
  marks: { must?: number[]; skipped?: number[]; bannedPacks?: number[] } = {},
): string {
  const lines: string[] = [];
  const must = new Set(marks.must ?? []);
  const name = (id: number): string => (must.has(id) ? `${giftName(id)} (${t('priorityMust', lang)})` : giftName(id));
  if (dropped.length > 0) lines.push(t('routeVariantWithout', lang, { name: dropped.map(giftName).join(', ') }));
  lines.push(`${t('routeStart', lang)}: ${plan.start.keyword ? keywordLabel(plan.start.keyword) : '—'}`);
  if (plan.start.startGift) lines.push(`  ${t('routeStartGift', lang)}: ${giftName(plan.start.startGift)}`);
  if (plan.start.observed.length > 0) {
    const observed = plan.start.observed.map(
      (o) => `${name(o.giftId)} (${o.pinned ? t('routeObservedPinned', lang) : t('routeObservedRecommended', lang)})`,
    );
    lines.push(`  ${t('routeObserved', lang)}: ${observed.join(', ')}`);
  }
  lines.push('');
  const metro = segmentsFor(plan);
  const rows: { at: number; text: string[] }[] = [];
  for (const run of metro.freeRuns) {
    rows.push({ at: run.from, text: [run.from === run.to ? `${run.from}F: ${t('routeFree', lang)}` : `${run.from}~${run.to}F: ${t('routeFree', lang)}`] });
  }
  for (const segment of metro.segments) {
    const head = segment.fixed
      ? `${segment.from}F`
      : segment.partial
        ? `${segment.from}~${segment.to}F (${t('routeSuggestOrder', lang, { from: segment.from, to: segment.to, order: suggestedOrder(segment).join(' → ') })})`
        : `${segment.from}~${segment.to}F (${t('routeAnyFloor', lang)})`;
    const text = [`${head}: ${segment.packs.map((p) => packName(p.packId)).join(' · ')}`];
    for (const pack of segment.packs) {
      for (const giftId of pack.gifts) {
        const pickup = plan.floors.find((f) => f.floor === pack.floor)?.pickups.find((p) => p.giftId === giftId);
        const why = pickup?.neededFor ? ` -> ${giftName(pickup.neededFor)}` : '';
        text.push(`  - ${name(giftId)}${segment.packs.length > 1 ? ` (${packName(pack.packId)})` : ''}${why}`);
      }
    }
    rows.push({ at: segment.from, text });
  }
  rows.sort((a, b) => a.at - b.at);
  for (const row of rows) lines.push(...row.text);
  if (plan.unresolved.length > 0) {
    lines.push('');
    lines.push(t('routeUnresolved', lang));
    for (const entry of plan.unresolved) lines.push(`  ${name(entry.giftId)}: ${pick(entry.detail, lang)}`);
  }
  if (marks.bannedPacks && marks.bannedPacks.length > 0) {
    lines.push('');
    lines.push(`${t('packBanned', lang)}: ${marks.bannedPacks.map(packName).join(', ')}`);
  }
  if (marks.skipped && marks.skipped.length > 0) {
    lines.push('');
    lines.push(`${t('prioritySkip', lang)}: ${marks.skipped.map(giftName).join(', ')}`);
  }
  return lines.join('\n');
}
