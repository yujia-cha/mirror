import { useMemo, useState } from 'react';
import type { GameData, Keyword } from '../core/schema.ts';
import { planRoute } from '../core/index.ts';
import type { GameIndexes, RoutePlan } from '../core/types.ts';
import { pick, t, type Lang } from './i18n.ts';
import { useApp } from './store.ts';
import { Button, Chip, Section, Toggle } from './ui.tsx';
import { conditionText } from './condition-text.ts';

export function OptionsPanel({ data, lang }: { data: GameData; lang: Lang }) {
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);

  return (
    <Section title={t('optionsHeading', lang)}>
      <div className="flex flex-wrap gap-4">
        <Toggle
          label={t('optionFloors', lang)}
          value={options.lastFloor}
          onChange={(lastFloor) => setOptions({ lastFloor })}
          options={[
            { value: 5 as const, label: t('optionFloors5', lang) },
            { value: 10 as const, label: t('optionFloors10', lang) },
            { value: 15 as const, label: t('optionFloors15', lang) },
          ]}
        />
        <Toggle
          label={t('optionDifficulty', lang)}
          value={options.hardFromFloor === null ? 'normal' : 'hard'}
          onChange={(value) => setOptions({ hardFromFloor: value === 'hard' ? 1 : null })}
          options={[
            { value: 'normal' as const, label: t('optionNormal', lang) },
            { value: 'hard' as const, label: t('optionHard', lang) },
          ]}
        />
        <Toggle
          label={t('optionObservation', lang)}
          value={options.giftObservationMax}
          onChange={(giftObservationMax) => setOptions({ giftObservationMax })}
          options={[0, 1, 2, 3].map((value) => ({ value, label: String(value) }))}
        />
        <Toggle
          label={t('optionStartKeyword', lang)}
          value={options.startKeyword}
          onChange={(startKeyword) => setOptions({ startKeyword: startKeyword as Keyword | 'auto' })}
          options={[
            { value: 'auto' as const, label: t('optionAuto', lang) },
            ...data.enums.keywords
              .filter((entry) => entry.status)
              .map((entry) => ({ value: entry.id as Keyword | 'auto', label: pick(entry.name, lang) })),
          ]}
        />
      </div>
      <label className="mt-3 flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={options.assumeUnvisitedPacks}
          onChange={(event) => setOptions({ assumeUnvisitedPacks: event.target.checked })}
        />
        {t('optionUnvisited', lang)}
      </label>
      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('optionObservationHint', lang)}</p>
    </Section>
  );
}

export function RoutePanel({ data, indexes, lang }: { data: GameData; indexes: GameIndexes; lang: Lang }) {
  const deck = useApp((s) => s.deck);
  const wanted = useApp((s) => s.wanted);
  const options = useApp((s) => s.options);
  const [copied, setCopied] = useState(false);

  const plan = useMemo(
    () =>
      planRoute(
        { deck, wanted: wanted.map((giftId) => ({ giftId, required: true })), options },
        data,
        indexes,
      ),
    [deck, wanted, options, data, indexes],
  );

  const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang) || String(id);
  const packName = (id: number): string => pick(indexes.packById.get(id)?.name, lang) || String(id);

  const copyAsText = async (): Promise<void> => {
    await navigator.clipboard.writeText(planToText(plan, giftName, packName, lang));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (wanted.length === 0) {
    return (
      <Section title={t('routeHeading', lang)}>
        <p className="py-6 text-center text-sm text-stone-500">{t('routeEmpty', lang)}</p>
      </Section>
    );
  }

  return (
    <Section
      title={t('routeHeading', lang)}
      actions={<Button onClick={copyAsText}>{copied ? t('routeCopied', lang) : t('routeCopy', lang)}</Button>}
    >
      <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
        <h3 className="mb-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
          {t('routeStart', lang)}
        </h3>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-stone-500">{t('routeStartKeyword', lang)}</dt>
            <dd>
              {plan.start.keyword
                ? pick(data.enums.keywords.find((k) => k.id === plan.start.keyword)?.name, lang)
                : '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-stone-500">{t('routeStartGift', lang)}</dt>
            <dd>{plan.start.startGift ? giftName(plan.start.startGift) : '—'}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-stone-500">{t('routeObserved', lang)}</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {plan.start.observed.length === 0
                ? '—'
                : plan.start.observed.map((id) => <Chip key={id}>{giftName(id)}</Chip>)}
              {plan.start.observed.length > 0 ? (
                <Chip tone="warn">
                  {t('routeStarlight', lang)} {plan.start.starlight}
                  {plan.start.starlightVerified ? '' : ` · ${t('routeUnverified', lang)}`}
                </Chip>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      <ol className="space-y-2">
        {plan.floors.map((floor) => (
          <li
            key={floor.floor}
            className={`rounded-lg border p-3 ${
              floor.packId === null
                ? 'border-dashed border-stone-200 dark:border-stone-800'
                : 'border-stone-300 dark:border-stone-700'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                {floor.floor}
                {t('routeFloor', lang)}
              </span>
              <Chip tone={floor.mode === 'normal' ? 'neutral' : floor.mode === 'hard' ? 'warn' : 'bad'}>
                {floor.mode}
              </Chip>
              <span className="text-sm">
                {floor.packId === null ? (
                  <span className="text-stone-400">{t('routeFreeFloor', lang)}</span>
                ) : (
                  packName(floor.packId)
                )}
              </span>
              {floor.observation.needed ? (
                floor.observation.possible ? (
                  <Chip tone="accent">
                    {t('routeObservationNeeded', lang)} · {t('routeStarlight', lang)}{' '}
                    {floor.observation.starlight}
                  </Chip>
                ) : (
                  <Chip tone="bad">{t('routeObservationImpossible', lang)}</Chip>
                )
              ) : null}
            </div>

            {floor.pickups.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {floor.pickups.map((pickup) => (
                  <li key={pickup.giftId} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-stone-400">·</span>
                    <span>{giftName(pickup.giftId)}</span>
                    <Chip tone={pickup.kind === 'exclusive' ? 'accent' : 'neutral'}>
                      {t(pickup.kind === 'exclusive' ? 'routePickupExclusive' : 'routePickupPool', lang)}
                    </Chip>
                    {pickup.neededFor ? (
                      <span className="text-xs text-stone-500">
                        → {giftName(pickup.neededFor)} {t('routeIngredientFor', lang)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {floor.alternatives.length > 0 ? (
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {t('routeAlternatives', lang)}: {floor.alternatives.slice(0, 4).map(packName).join(', ')}
                {floor.alternatives.length > 4 ? ` +${floor.alternatives.length - 4}` : ''}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {plan.fusions.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
            {t('routeFusions', lang)}
          </h3>
          <ul className="space-y-1 text-sm">
            {plan.fusions.map((fusion) => (
              <li key={fusion.result} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{giftName(fusion.result)}</span>
                <span className="text-stone-400">←</span>
                <span>{fusion.ingredients.map(giftName).join(' + ')}</span>
                {fusion.unreachable ? (
                  <Chip tone="bad">{t('routeFusionImpossible', lang)}</Chip>
                ) : (
                  <Chip>
                    {lang === 'ko'
                      ? `${fusion.earliestFloor}${t('routeFusionFrom', lang)}`
                      : `${t('routeFusionFrom', lang)} ${fusion.earliestFloor}`}
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.generalDrops.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
            {t('routeGeneralDrops', lang)}
          </h3>
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            {t('routeGeneralDropsHint', lang)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.generalDrops.map((id) => (
              <Chip key={id}>{giftName(id)}</Chip>
            ))}
          </div>
        </div>
      ) : null}

      {plan.conditions.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
            {t('routeConditions', lang)}
          </h3>
          <ul className="space-y-1 text-sm">
            {plan.conditions.map((report, index) => (
              <li key={`${report.giftId}-${index}`} className="flex flex-wrap items-center gap-1.5">
                <Chip tone={report.satisfied ? 'good' : 'bad'}>{report.satisfied ? 'O' : 'X'}</Chip>
                <span>{giftName(report.giftId)}</span>
                <span className="text-xs text-stone-500">{conditionText(report, data.enums, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.unresolved.length > 0 ? (
        <div className="mt-4 rounded-lg border border-rose-300/60 bg-rose-50/50 p-3 dark:border-rose-500/40 dark:bg-rose-500/5">
          <h3 className="mb-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {t('routeUnresolved', lang)}
          </h3>
          <ul className="space-y-1 text-sm">
            {plan.unresolved.map((entry) => (
              <li key={`${entry.giftId}-${entry.reason}`}>
                <span className="font-medium">{giftName(entry.giftId)}</span>{' '}
                <span className="text-xs text-stone-600 dark:text-stone-300">{pick(entry.detail, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.warnings.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
            {t('routeWarnings', lang)}
          </h3>
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {plan.warnings.map((warning) => (
              <li key={warning.code}>{pick(warning.detail, lang)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200 pt-3 text-xs dark:border-stone-800">
        <Chip>
          {t('routeRequiredPacks', lang)} {plan.stats.requiredPacks}
        </Chip>
        <Chip>
          {t('routeStarlight', lang)} {plan.stats.starlight}
        </Chip>
        <Chip tone={plan.stats.coveredWanted === plan.stats.totalWanted ? 'good' : 'warn'}>
          {t('routeCovered', lang)} {plan.stats.coveredWanted}/{plan.stats.totalWanted}
        </Chip>
        <Chip>{plan.stats.elapsedMs}ms</Chip>
      </div>
    </Section>
  );
}

/** A Discord-friendly plain-text rendering of the plan. */
function planToText(
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
    const pack = floor.packId === null ? t('routeFreeFloor', lang) : packName(floor.packId);
    const obs = floor.observation.needed
      ? floor.observation.possible
        ? ` [${t('routeObservationNeeded', lang)} +${floor.observation.starlight}]`
        : ` [${t('routeObservationImpossible', lang)}]`
      : '';
    lines.push(`${floor.floor}${t('routeFloor', lang)} (${floor.mode}) ${pack}${obs}`);
    for (const pickup of floor.pickups) {
      const why = pickup.neededFor ? ` -> ${giftName(pickup.neededFor)}` : '';
      lines.push(`  - ${giftName(pickup.giftId)}${why}`);
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
  if (plan.unresolved.length > 0) {
    lines.push('');
    lines.push(t('routeUnresolved', lang));
    for (const entry of plan.unresolved)
      lines.push(`  ${giftName(entry.giftId)}: ${pick(entry.detail, lang)}`);
  }
  return lines.join('\n');
}
