import type { Keyword } from '../../core/schema.ts';
import type { RoutePlan } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { MODE_LABEL } from './labels.ts';

/**
 * A Discord-friendly plain-text rendering of the plan. Ids are localized by the callbacks. Only
 * what the route decides is written: packs per floor and their guaranteed pickups, the start,
 * observations and what stays unresolved. Recipes and general drops are left to the game.
 */
export function planToText(
  plan: RoutePlan,
  giftName: (id: number) => string,
  packName: (id: number) => string,
  keywordLabel: (id: Keyword) => string,
  lang: Lang,
  dropped: number[] = [],
  marks: { must?: number[]; skipped?: number[] } = {},
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
  for (const floor of plan.floors) {
    const pack = floor.packId === null ? t('routeFree', lang) : packName(floor.packId);
    const window =
      floor.window && floor.window.from !== floor.window.to
        ? ` [${t('routeWindowShort', lang, { from: floor.window.from, to: floor.window.to })}]`
        : '';
    lines.push(`${floor.floor}F (${t(MODE_LABEL[floor.mode], lang)}) ${pack}${window}`);
    for (const pickup of floor.pickups.filter((p) => p.kind === 'exclusive')) {
      const why = pickup.neededFor ? ` -> ${giftName(pickup.neededFor)}` : '';
      lines.push(`  - ${name(pickup.giftId)}${why}`);
    }
  }
  if (plan.unresolved.length > 0) {
    lines.push('');
    lines.push(t('routeUnresolved', lang));
    for (const entry of plan.unresolved) lines.push(`  ${name(entry.giftId)}: ${pick(entry.detail, lang)}`);
  }
  if (marks.skipped && marks.skipped.length > 0) {
    lines.push('');
    lines.push(`${t('prioritySkip', lang)}: ${marks.skipped.map(giftName).join(', ')}`);
  }
  return lines.join('\n');
}
