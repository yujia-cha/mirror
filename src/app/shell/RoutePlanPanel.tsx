/**
 * The whole route, as the right panel shows it: the counts, the alternative routes, the metro map
 * in its vertical form, the unresolved card with its pack-level choices, and the condition
 * judgements — and, at the top, every goal as a pressable tile sharing the run record with the
 * stage. Wide enough for a phone drawer or a 336px desktop panel.
 */
import { useRef, useState } from 'react';
import { Ban, Copy, Hourglass, Star } from 'lucide-react';
import { conflictGroups } from '../../core/index.ts';
import { pick, t } from '../i18n.ts';
import { useApp } from '../store.ts';
import { conditionText } from '../condition-text.ts';
import { planToText } from '../lib/plan-text.ts';
import { priorityOf } from '../lib/plan-input.ts';
import { actionsFor, type UnresolvedAction } from '../lib/unresolved-actions.ts';
import { FusionNotice } from '../components/FusionNotice.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';
import { GiftTile } from '../components/GiftTile.tsx';
import { MetroMap } from '../components/MetroMap.tsx';
import { PackConflicts } from '../components/PackConflicts.tsx';
import { Badge, Button, Card, Notice, SectionTitle, Toast } from '../components/ui.tsx';
import { usePlan } from './PlanContext.tsx';

export function RoutePlanPanel({ onOpenGifts }: { onOpenGifts?: () => void }) {
  const { data, indexes, stats, lang, input, plan, shown, variants, variantIndex, setVariantIndex, variant, skipped, judgements, giftTitle, giftName, packName, keywordLabel, ctx, openGift } = usePlan();
  const wanted = useApp((s) => s.wanted);
  const priority = useApp((s) => s.priority);
  const options = useApp((s) => s.options);
  const run = useApp((s) => s.run);
  const setOptions = useApp((s) => s.setOptions);
  const setPriority = useApp((s) => s.setPriority);
  const setGiftStatus = useApp((s) => s.setGiftStatus);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  if (!plan || !shown) {
    return (
      <Card className="flex flex-col items-center gap-2.5 px-4 py-8 text-center" testId="route-empty">
        <Star size={28} className="text-fg-3" aria-hidden />
        <div className="text-sm font-semibold">{t('routeEmpty', lang)}</div>
        <div className="text-xs text-fg-3">{t('routeEmptyHint', lang)}</div>
        {onOpenGifts ? (
          <Button variant="primary" onClick={onOpenGifts}>
            {t('tabGifts', lang)}
          </Button>
        ) : null}
      </Card>
    );
  }

  const capped = shown.stats.searchCapped;
  const SILENT_WARNINGS = new Set(['search-capped', 'parallel-requires-hard', 'general-drop-not-guaranteed', 'condition-unmet', 'fusion-slots']);
  const otherWarnings = shown.warnings.filter((w) => !SILENT_WARNINGS.has(w.code));
  // The planner reports every miss it had to work around, ingredients included.
  const failedCount = shown.unresolved.filter((u) => u.reason === 'failed').length;

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(
      planToText(shown, giftName, packName, keywordLabel, lang, variant?.dropped ?? [], {
        must: wanted.filter((id) => priorityOf(priority, id) === 'must'),
        skipped,
        bannedPacks: options.bannedPacks,
        ...(run.currentFloor > 1 || Object.keys(run.visits).length > 0 ? { run: { currentFloor: run.currentFloor, visits: run.visits } } : {}),
      }),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const summary = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="route-summary">
      {(
        [
          ['routeRequiredPacks', String(shown.stats.requiredPacks)],
          ['routeCovered', `${shown.stats.coveredWanted}/${shown.stats.totalWanted}`],
        ] as const
      ).map(([key, value]) => (
        <span key={key} className="inline-flex items-baseline gap-1.5">
          <span className="text-xs text-fg-3">{t(key, lang)}</span>
          <span className="font-mono text-lg font-bold text-fg">{value}</span>
        </span>
      ))}
      {skipped.length > 0 ? <span className="text-xs text-fg-3">{t('routeSkipped', lang, { n: skipped.length })}</span> : null}
      {failedCount > 0 ? <Badge tone="alert">{t('runFailedCount', lang, { n: failedCount })}</Badge> : null}
      {shown.unresolved.length > 0 ? <Badge tone="neutral">{t('routeUnresolvedCount', lang, { n: shown.unresolved.length })}</Badge> : null}
      {capped ? <Badge tone="approx">{t('routeApprox', lang)}</Badge> : null}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={copy} ariaLabel={t('routeCopy', lang)}>
        <Copy size={13} aria-hidden />
        {t('routeCopy', lang)}
      </Button>
    </div>
  );

  const variantTabs =
    variants.length > 0 ? (
      <div ref={tabsRef} className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('routeVariants', lang)} data-testid="variants">
        <span className="mr-1 text-xs text-fg-3">{t('routeVariants', lang)}</span>
        {[{ dropped: [] as number[], plan }, ...variants].map((entry, i) => {
          const selected = i === variantIndex;
          const dropped = entry.dropped[0];
          const gift = dropped !== undefined ? indexes.giftById.get(dropped) : undefined;
          return (
            <button
              key={dropped ?? 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setVariantIndex(i)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${
                selected ? 'border-ink bg-ink text-ink-fg' : 'border-line-strong bg-surface text-fg-2 hover:bg-surface-2'
              }`}
            >
              {gift ? <GiftIcon gift={gift} size={20} lang={lang} /> : null}
              <span>{gift ? t('routeVariantWithout', lang, { name: giftName(gift.id) }) : t('routeVariantAll', lang)}</span>
              <span className="font-mono opacity-80">
                {entry.plan.stats.coveredWanted}/{entry.plan.stats.totalWanted}
              </span>
            </button>
          );
        })}
        {variant ? (
          <Button size="sm" variant="ghost" onClick={() => setPriority(variant.dropped[0]!, 'skip')}>
            <Ban size={12} aria-hidden />
            {t('routeVariantConfirm', lang)}
          </Button>
        ) : null}
      </div>
    ) : null;

  const cappedBanner = capped ? (
    <Notice strong icon={<Hourglass size={14} aria-hidden />}>
      <b>{t('routeApprox', lang)}.</b> {pick(shown.warnings.find((w) => w.code === 'search-capped')?.detail, lang)}
    </Notice>
  ) : null;

  const actionLabel = (action: UnresolvedAction): string =>
    action.kind === 'observeGift'
      ? t('actionObserveGift', lang, { name: action.giftId !== undefined ? giftName(action.giftId) : '' })
      : t('actionReleaseObservations', lang);
  const unresolvedActions = shown.unresolved.map((entry) =>
    actionsFor(entry, indexes.giftById.get(entry.giftId), options, data.rules).map((action) => ({ ...action, label: actionLabel(action) })),
  );
  const sharedLabels = new Set(
    unresolvedActions
      .flat()
      .map((a) => a.label)
      .filter((label, _, all) => all.filter((l) => l === label).length > 1),
  );
  const headerActions = [...new Map(unresolvedActions.flat().filter((a) => sharedLabels.has(a.label)).map((a) => [a.label, a])).values()];
  const shownInput = variant ? { ...input, wanted: input.wanted.filter((w) => !variant.dropped.includes(w.giftId)) } : input;
  const groups = conflictGroups(shown, shownInput, data, indexes);
  const others = shown.unresolved.filter((u) => u.reason !== 'pack-conflict');
  const seeVariants = (): void => {
    tabsRef.current?.scrollIntoView?.({ block: 'center' });
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]?.focus();
  };

  // Every goal the player set, 포기 included, as the same pressable tiles the stage and the tracker
  // use: one record (`run.giftStatus`) behind all three. A fusion goal carries its ingredients,
  // which are what the packs actually drop.
  const gotCount = wanted.filter((id) => run.giftStatus[id] === 'got').length;
  const noticeGift = notice !== null ? indexes.giftById.get(notice) : undefined;
  const goalTile = (id: number, asGoal: boolean) => {
    const gift = indexes.giftById.get(id);
    return gift ? (
      <GiftTile
        key={id}
        gift={gift}
        size={32}
        status={run.giftStatus[id] ?? null}
        wanted={asGoal}
        must={asGoal && ctx.isMust(id)}
        judgement={judgements.get(id) ?? null}
        title={giftTitle(id)}
        onToggle={(next) => {
          setGiftStatus(id, next);
          if (gift.fusion?.mixed) setNotice(next === 'got' ? id : null);
        }}
        onOpen={() => openGift(id)}
        lang={lang}
      />
    ) : null;
  };
  const goals = (
    <Card className="px-3 py-2.5" testId="route-goals">
      <SectionTitle right={<span className="font-mono text-xs text-fg-3">{`${gotCount}/${wanted.length}`}</span>}>{t('routeGoals', lang)}</SectionTitle>
      <p className="mt-1 text-xs text-fg-3">{t('routeGoalsHint', lang)}</p>
      {noticeGift ? (
        <div className="mt-2">
          <FusionNotice gift={noticeGift} giftStatus={run.giftStatus} indexes={indexes} onUnmark={(id) => setGiftStatus(id, null)} onClose={() => setNotice(null)} lang={lang} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-1.5">
        {wanted.map((id) => {
          const level = priorityOf(priority, id);
          const fusion = shown.fusions.find((f) => f.result === id);
          return (
            <div key={id} className={`flex flex-wrap items-center gap-1.5 ${level === 'skip' ? 'opacity-60' : ''}`} data-testid="route-goal" data-gift={id} data-priority={level}>
              {goalTile(id, level !== 'skip')}
              {fusion ? (
                <>
                  <span className="text-xs text-fg-3" aria-label={t('routeGoalsIngredients', lang)}>
                    ←
                  </span>
                  {fusion.ingredients.map((ingredient) => goalTile(ingredient, false))}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );

  const conditionGifts = [...new Set(shown.conditions.map((c) => c.giftId))];
  const conditions = (
    <Card className="p-3.5" testId="conditions">
      <SectionTitle right={t('routeConditionsBasis', lang, { n: stats.deployed.length })}>{t('routeConditions', lang)}</SectionTitle>
      {conditionGifts.length === 0 ? (
        <p className="mt-2 text-xs text-fg-3">—</p>
      ) : (
        <ul className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {conditionGifts.map((giftId) => {
            const gift = indexes.giftById.get(giftId);
            if (!gift) return null;
            const reports = shown.conditions.filter((c) => c.giftId === giftId);
            const judgeable = reports.every((r) => r.have !== null && r.need !== null);
            const worst = reports.find((r) => !r.satisfied) ?? reports[0]!;
            return (
              <li key={giftId} className="flex items-center gap-2 rounded-sm border border-line px-2 py-1.5">
                <GiftIcon gift={gift} size={44} judgement={judgements.get(giftId) ?? null} title={giftTitle(giftId)} lang={lang} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm font-medium leading-tight">{giftName(giftId)}</span>
                  <span className="font-mono text-xs text-fg-2">{judgeable ? `${worst.have}/${worst.need}` : t('giftUnjudgeable', lang)}</span>
                  <span className="sr-only">{reports.map((r) => conditionText(r, data.enums, lang)).join(' / ')}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="route-plan">
      {summary}
      {variantTabs}
      {cappedBanner}
      {goals}
      <MetroMap plan={shown} ctx={ctx} keywordLabel={keywordLabel} run={{ currentFloor: run.currentFloor }} variant="vertical" detailMode="sheet" />
      <PackConflicts
        groups={groups}
        others={others}
        skippedGifts={skipped}
        ctx={ctx}
        priorityOf={(id) => priorityOf(priority, id)}
        setPriority={setPriority}
        observeAction={(entry) => {
          const i = shown.unresolved.indexOf(entry);
          return (unresolvedActions[i] ?? []).find((a) => a.kind === 'observeGift' && !sharedLabels.has(a.label));
        }}
        headerActions={headerActions}
        onAction={(action) => setOptions(action.patch)}
        onSeeVariants={variants.length > 0 && !variant ? seeVariants : undefined}
        detailMode="sheet"
      />
      {conditions}
      {otherWarnings.length > 0 ? (
        <Card className="p-3.5">
          <SectionTitle>{t('routeWarnings', lang)}</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-2">
            {otherWarnings.map((w) => (
              <li key={w.code}>{pick(w.detail, lang)}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {copied ? <Toast>{t('routeCopied', lang)}</Toast> : null}
    </div>
  );
}
