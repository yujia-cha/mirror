import type { RoutePlan } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';

/** A Discord-friendly plain-text rendering of the plan. */
export function planToText(
  plan: RoutePlan,
  giftName: (id: number) => string,
  packName: (id: number) => string,
  lang: Lang,
): string {
  const lines: string[] = [];
  lines.push(`${t('routeStart', lang)}: ${plan.start.keyword ?? '—'}`);
  if (plan.start.startGift) lines.push(`  ${t('routeStartGift', lang)}: ${giftName(plan.start.startGift)}`);
  if (plan.start.observed.length > 0) {
    lines.push(
      `  ${t('routeObserved', lang)}: ${plan.start.observed.map(giftName).join(', ')} ` +
        `(${t('routeStarlight', lang)} ${plan.start.starlight})`,
    );
  }
  lines.push('');
  for (const floor of plan.floors) {
    const pack = floor.packId === null ? t('routeFree', lang) : packName(floor.packId);
    const window =
      floor.window && floor.window.from !== floor.window.to
        ? ` [${t('routeWindowShort', lang, { from: floor.window.from, to: floor.window.to })}]`
        : '';
    const obs = floor.observation.needed
      ? floor.observation.possible
        ? ` [${t('legendEye', lang)} +${floor.observation.starlight}]`
        : ` [${t('routeObservationImpossible', lang)}]`
      : '';
    lines.push(`${floor.floor}F (${floor.mode}) ${pack}${window}${obs}`);
    for (const pickup of floor.pickups) {
      const why = pickup.neededFor ? ` -> ${giftName(pickup.neededFor)}` : '';
      const sure = pickup.kind === 'exclusive' ? t('acqSure', lang) : t('acqMaybe', lang);
      lines.push(`  - ${giftName(pickup.giftId)} [${sure}]${why}`);
    }
  }
  if (plan.fusions.length > 0) {
    lines.push('');
    lines.push(t('routeFusions', lang));
    for (const fusion of plan.fusions) {
      lines.push(
        `  ${giftName(fusion.result)} <- ${fusion.ingredients.map(giftName).join(' + ')}` +
          (fusion.unreachable ? ` (${t('routeFusionImpossible', lang)})` : ` (${fusion.earliestFloor}F+)`),
      );
    }
  }
  if (plan.generalDrops.length > 0) {
    lines.push('');
    lines.push(`${t('routeGeneralDrops', lang)} (${t('routeGeneralNotSure', lang)})`);
    for (const id of plan.generalDrops) lines.push(`  - ${giftName(id)}`);
  }
  if (plan.unresolved.length > 0) {
    lines.push('');
    lines.push(t('routeUnresolved', lang));
    for (const entry of plan.unresolved) lines.push(`  ${giftName(entry.giftId)}: ${pick(entry.detail, lang)}`);
  }
  return lines.join('\n');
}
