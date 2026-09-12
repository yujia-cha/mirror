import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, ChevronLeft, Copy, Hourglass, RefreshCw, Star } from 'lucide-react';
import type { GameData, Keyword } from '../../core/schema.ts';
import { conflictGroups, observable, planAlternatives, planRoute } from '../../core/index.ts';
import type { DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { keywordName } from '../format.ts';
import { conditionText } from '../condition-text.ts';
import { planToText } from '../lib/plan-text.ts';
import { actionsFor, type UnresolvedAction } from '../lib/unresolved-actions.ts';
import { judgementsByGift } from '../lib/judgement.ts';
import { planInputFor, priorityOf, skippedGifts } from '../lib/plan-input.ts';
import { Badge, Button, Card, Notice, SectionTitle, Toast } from '../components/ui.tsx';
import { MetroMap } from '../components/MetroMap.tsx';
import { PackConflicts } from '../components/PackConflicts.tsx';
import type { PackContext } from '../components/PackSheet.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
}

function actionLabel(action: UnresolvedAction, lang: Lang, giftName: (id: number) => string): string {
  switch (action.kind) {
    case 'observeGift':
      return t('actionObserveGift', lang, { name: action.giftId !== undefined ? giftName(action.giftId) : '' });
    case 'releaseObservations':
      return t('actionReleaseObservations', lang);
  }
}

export function RouteStep({ data, indexes, stats, lang }: Props) {
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const wanted = useApp((s) => s.wanted);
  const priority = useApp((s) => s.priority);
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);
  const resetOptions = useApp((s) => s.resetOptions);
  const setPriority = useApp((s) => s.setPriority);
  const preferPack = useApp((s) => s.preferPack);
  const banPack = useApp((s) => s.banPack);
  const restorePack = useApp((s) => s.restorePack);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const setStep = useApp((s) => s.setStep);
  const [copied, setCopied] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  // Given-up gifts stay selected but leave the plan; must-have ones are what the search keeps first.
  const input = useMemo(() => planInputFor({ deck, deployed, wanted, priority, options }), [deck, deployed, wanted, priority, options]);
  const skipped = skippedGifts(wanted, priority);
  const plan = useMemo(() => (input.wanted.length === 0 ? null : planRoute(input, data, indexes)), [input, data, indexes]);
  // Alternatives only exist when packs collide, so this is free on the common path.
  const variants = useMemo(
    () => (plan && plan.unresolved.some((u) => u.reason === 'pack-conflict') ? planAlternatives(input, data, indexes, plan) : []),
    [plan, input, data, indexes],
  );
  useEffect(() => setVariantIndex(0), [input]);
  const variant = variantIndex > 0 ? variants[variantIndex - 1] : undefined;

  const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang);
  const packName = (id: number): string => pick(indexes.packById.get(id)?.name, lang);

  const optionsBar = (
    <Card className="flex flex-wrap items-end gap-3 px-3.5 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-3">{t('optionStartKeyword', lang)}</span>
        <select
          aria-label={t('optionStartKeyword', lang)}
          value={options.startKeyword}
          onChange={(event) => setOptions({ startKeyword: event.target.value as Keyword | 'auto' })}
          className="h-[30px] rounded-full border border-line bg-surface-2 px-2.5 text-xs text-fg-2"
        >
          <option value="auto">{t('optionAuto', lang)}</option>
          {data.enums.keywords.map((k) => (
            <option key={k.id} value={k.id}>
              {pick(k.name, lang)}
            </option>
          ))}
        </select>
      </div>
      <span className="text-xs text-fg-3">{t('routeAllPlanned', lang)}</span>
      <Button variant="ghost" size="sm" onClick={resetOptions} className="ml-auto">
        <RefreshCw size={12} aria-hidden />
        {t('optionReset', lang)}
      </Button>
    </Card>
  );

  if (!plan) {
    return (
      <div className="flex flex-col gap-3">
        {optionsBar}
        <Card className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
          <Star size={28} className="text-fg-3" aria-hidden />
          <div className="text-sm font-semibold">{t('routeEmpty', lang)}</div>
          <div className="text-xs text-fg-3">{t('routeEmptyHint', lang, { n: deployed.length })}</div>
          <Button variant="primary" onClick={() => setStep(2)}>
            <ChevronLeft size={14} aria-hidden />
            {t('toGifts', lang)}
          </Button>
        </Card>
      </div>
    );
  }

  const shown = variant?.plan ?? plan;
  const capped = shown.stats.searchCapped;
  // Judgement is on the icons and general drops are the game's business, so those warnings are
  // not repeated as notes; the ones left change what the player should do on the run.
  const SILENT_WARNINGS = new Set(['search-capped', 'parallel-requires-hard', 'general-drop-not-guaranteed', 'condition-unmet', 'fusion-slots']);
  const otherWarnings = shown.warnings.filter((w) => !SILENT_WARNINGS.has(w.code));
  const judgements = judgementsByGift(shown.conditions);
  const giftTitle = (id: number): string | undefined => {
    const reports = shown.conditions.filter((c) => c.giftId === id);
    return reports.length > 0 ? reports.map((r) => conditionText(r, data.enums, lang)).join(' / ') : undefined;
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(
      planToText(shown, giftName, packName, (id) => keywordName(id, data.enums, lang), lang, variant?.dropped ?? [], {
        must: wanted.filter((id) => priorityOf(priority, id) === 'must'),
        skipped,
        bannedPacks: options.bannedPacks,
      }),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const summary = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(
        [
          ['routeRequiredPacks', String(shown.stats.requiredPacks)],
          ['routeCovered', `${shown.stats.coveredWanted}/${shown.stats.totalWanted}`],
        ] as const
      ).map(([key, value]) => (
        <span key={key} className="inline-flex items-baseline gap-1.5">
          <span className="text-xs text-fg-3">{t(key, lang)}</span>
          <span className="font-mono text-lg font-bold text-fg lg:text-xl">{value}</span>
        </span>
      ))}
      {skipped.length > 0 ? <span className="text-xs text-fg-3">{t('routeSkipped', lang, { n: skipped.length })}</span> : null}
      {capped ? <Badge tone="approx">{t('routeApprox', lang)}</Badge> : null}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={copy} ariaLabel={t('routeCopy', lang)}>
        <Copy size={13} aria-hidden />
        <span className="hidden sm:inline">{t('routeCopy', lang)}</span>
      </Button>
    </div>
  );

  // One tab per gift worth leaving out, when the full set cannot fit in a run.
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

  // Judgement lives on the icon border; the sentence stays as hover text.
  const conditionGifts = [...new Set(shown.conditions.map((c) => c.giftId))];
  const conditions = (
    <Card className="p-3.5" testId="conditions">
      <SectionTitle right={t('routeConditionsBasis', lang, { n: stats.deployed.length })}>{t('routeConditions', lang)}</SectionTitle>
      {conditionGifts.length === 0 ? (
        <p className="mt-2 text-xs text-fg-3">—</p>
      ) : (
        <ul className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
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

  // Observation actions shared by several entries appear once in the header; entry-specific ones
  // become the eye button on the row. Pack conflicts are decided pack by pack instead.
  const unresolvedActions = shown.unresolved.map((entry) =>
    actionsFor(entry, indexes.giftById.get(entry.giftId), options, data.rules).map((action) => ({
      ...action,
      label: actionLabel(action, lang, giftName),
    })),
  );
  const sharedLabels = new Set(
    unresolvedActions
      .flat()
      .map((a) => a.label)
      .filter((label, _, all) => all.filter((l) => l === label).length > 1),
  );
  const headerActions = [...new Map(unresolvedActions.flat().filter((a) => sharedLabels.has(a.label)).map((a) => [a.label, a])).values()];
  const seeVariants = (): void => {
    tabsRef.current?.scrollIntoView?.({ block: 'center' });
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]?.focus();
  };
  const shownInput = variant ? { ...input, wanted: input.wanted.filter((w) => !variant.dropped.includes(w.giftId)) } : input;
  const groups = conflictGroups(shown, shownInput, data, indexes);
  const others = shown.unresolved.filter((u) => u.reason !== 'pack-conflict');

  const packCtx: PackContext = {
    indexes,
    judgements,
    giftTitle,
    giftName,
    packName,
    isMust: (id) => priorityOf(priority, id) === 'must',
    observable: (id) => {
      const gift = indexes.giftById.get(id);
      return gift ? observable(gift, data.rules) : false;
    },
    observed: new Set(shown.start.observed.filter((o) => o.pinned).map((o) => o.giftId)),
    wanted: new Set(input.wanted.map((w) => w.giftId)),
    preferred: new Set(options.preferredPacks),
    banned: new Set(options.bannedPacks),
    assignedAt: (packId) => shown.floors.find((f) => f.packId === packId && f.reason !== 'free')?.floor ?? null,
    onPrefer: variant ? undefined : preferPack,
    onBan: variant ? undefined : banPack,
    onRestore: variant ? undefined : restorePack,
    onToggleObserved: variant ? undefined : (giftId) => toggleObserved(giftId, data.rules.giftObservation.max),
    lang,
  };

  const unresolved = (
    <PackConflicts
      groups={groups}
      others={others}
      skippedGifts={skipped}
      ctx={packCtx}
      priorityOf={(id) => priorityOf(priority, id)}
      setPriority={setPriority}
      observeAction={(entry) => {
        const i = shown.unresolved.indexOf(entry);
        return (unresolvedActions[i] ?? []).find((a) => a.kind === 'observeGift' && !sharedLabels.has(a.label));
      }}
      headerActions={headerActions}
      onAction={(action) => setOptions(action.patch)}
      onSeeVariants={variants.length > 0 && !variant ? seeVariants : undefined}
    />
  );

  const notes =
    otherWarnings.length > 0 ? (
      <Card className="p-3.5">
        <SectionTitle>{t('routeWarnings', lang)}</SectionTitle>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-2">
          {otherWarnings.map((w) => (
            <li key={w.code}>{pick(w.detail, lang)}</li>
          ))}
        </ul>
      </Card>
    ) : null;

  // DOM order is the desktop order; on a phone the summary and the unresolved card come first.
  return (
    <div className="flex flex-col gap-3">
      <div className="order-3 lg:order-none">{optionsBar}</div>
      <div className="order-1 lg:order-none">{summary}</div>
      {variantTabs ? <div className="order-2 lg:order-none">{variantTabs}</div> : null}
      {cappedBanner ? <div className="order-2 lg:order-none">{cappedBanner}</div> : null}
      <div className="order-6 lg:order-none">
        <MetroMap plan={shown} ctx={packCtx} keywordLabel={(id) => keywordName(id, data.enums, lang)} />
      </div>
      <div className="order-2 lg:order-none">{unresolved}</div>
      <div className="order-7 grid grid-cols-1 gap-3 pb-4 lg:order-none lg:grid-cols-2">
        {conditions}
        {notes}
      </div>
      <div className="order-8 hidden justify-start pb-4 lg:order-none lg:flex">
        <Button variant="ghost" onClick={() => setStep(2)}>
          <ChevronLeft size={14} aria-hidden />2 {t('step2', lang)}
        </Button>
      </div>
      {copied ? <Toast>{t('routeCopied', lang)}</Toast> : null}
    </div>
  );
}
