import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Copy, Hourglass, Info, Lock, RefreshCw, Star, TriangleAlert } from 'lucide-react';
import type { GameData, Keyword } from '../../core/schema.ts';
import { planAlternatives, planRoute } from '../../core/index.ts';
import type { DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { keywordName } from '../format.ts';
import { conditionText } from '../condition-text.ts';
import { UNRESOLVED_LABEL, bandOf } from '../lib/labels.ts';
import { planToText } from '../lib/plan-text.ts';
import { actionsFor, type UnresolvedAction } from '../lib/unresolved-actions.ts';
import { judgementsByGift } from '../lib/judgement.ts';
import { Badge, Button, Card, Chip, Notice, SectionTitle, Toast } from '../components/ui.tsx';
import { Timetable } from '../components/Timetable.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';
import { MAX_FLOOR } from '../lib/timetable.ts';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
}

function FloorBandPicker({ lastFloor, onChange, lang }: { lastFloor: number; onChange: (floor: number) => void; lang: Lang }) {
  const bands = [t('optionBandHard', lang), t('optionBandParallel', lang), t('optionBandExtreme', lang)];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-fg-3">
        <span>{t('optionFloorRange', lang)}</span>
        <span className="flex gap-3">
          {bands.map((b) => (
            <span key={b}>{b}</span>
          ))}
        </span>
      </div>
      <div role="radiogroup" aria-label={t('optionFloorRange', lang)} className="flex overflow-hidden rounded-sm border border-line-strong">
        {Array.from({ length: MAX_FLOOR }, (_, i) => i + 1).map((f) => {
          const sel = f <= lastFloor;
          const band = bandOf(f);
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={f === lastFloor}
              aria-label={`${f}`}
              onClick={() => onChange(f)}
              className={`flex h-7 min-w-0 flex-1 items-center justify-center border-r border-line font-mono text-xs last:border-r-0 ${
                sel ? 'bg-ink text-ink-fg' : band === 2 ? 'bg-hatch text-fg-3' : band === 1 ? 'bg-surface-2 text-fg-3' : 'text-fg-3'
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function actionLabel(action: UnresolvedAction, lang: Lang, giftName: (id: number) => string): string {
  switch (action.kind) {
    case 'switchHard':
      return t('actionSwitchHard', lang);
    case 'extendFloors':
      return t('actionExtendFloors', lang, { n: action.floor ?? 0 });
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
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);
  const resetOptions = useApp((s) => s.resetOptions);
  const removeWanted = useApp((s) => s.removeWanted);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const setStep = useApp((s) => s.setStep);
  const [copied, setCopied] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const hard = options.hardFromFloor !== null || options.lastFloor > 5;
  const autoHard = options.hardFromFloor === null && options.lastFloor > 5;

  const plan = useMemo(
    () =>
      wanted.length === 0
        ? null
        : planRoute(
            { deck, wanted: wanted.map((giftId) => ({ giftId, required: true })), options: { ...options, deployed } },
            data,
            indexes,
          ),
    [deck, deployed, wanted, options, data, indexes],
  );
  // Alternatives only exist when packs collide, so this is free on the common path.
  const variants = useMemo(
    () =>
      plan && plan.unresolved.some((u) => u.reason === 'pack-conflict')
        ? planAlternatives(
            { deck, wanted: wanted.map((giftId) => ({ giftId, required: true })), options: { ...options, deployed } },
            data,
            indexes,
            plan,
          )
        : [],
    [plan, deck, deployed, wanted, options, data, indexes],
  );
  useEffect(() => setVariantIndex(0), [wanted, options]);
  const variant = variantIndex > 0 ? variants[variantIndex - 1] : undefined;

  const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang);
  const packName = (id: number): string => pick(indexes.packById.get(id)?.name, lang);

  const setLastFloor = (floor: number): void => {
    setOptions(floor > 5 ? { lastFloor: floor, hardFromFloor: 1 } : { lastFloor: floor });
  };

  const optionsBar = (
    <Card className="flex flex-col gap-3 px-3.5 py-3 lg:flex-row lg:items-end lg:gap-4">
      <FloorBandPicker lastFloor={options.lastFloor} onChange={setLastFloor} lang={lang} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-3">{t('optionDifficulty', lang)}</span>
          {hard ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ink px-2.5 text-sm font-medium text-ink-fg" data-testid="hard-locked">
              <Lock size={13} aria-hidden />
              {t('optionHardLocked', lang)}
            </span>
          ) : (
            <Button onClick={() => setOptions({ hardFromFloor: 1 })}>
              <ArrowRight size={13} aria-hidden />
              {t('optionHardSwitch', lang)}
            </Button>
          )}
        </div>
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
      </div>
      <Button variant="ghost" size="sm" onClick={resetOptions} className="self-start lg:ml-auto lg:self-end">
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
      planToText(shown, giftName, packName, (id) => keywordName(id, data.enums, lang), lang, variant?.dropped ?? []),
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
          <Button size="sm" variant="ghost" onClick={() => removeWanted(variant.dropped[0]!)}>
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
  const autoHardNotice = autoHard ? <Notice icon={<Info size={14} aria-hidden />}>{t('optionHardAuto', lang)}</Notice> : null;

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

  // Actions shared by several entries appear once in the header; entry-specific ones stay inline.
  const unresolvedActions = shown.unresolved.map((entry) =>
    actionsFor(entry, indexes.giftById.get(entry.giftId), indexes.packById, options, data.rules).map((action) => ({
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
  const actionButton = (action: UnresolvedAction & { label: string }) => (
    <Button key={action.label} size="sm" onClick={() => setOptions(action.patch)}>
      {action.label}
      <ChevronRight size={12} aria-hidden />
    </Button>
  );
  const seeVariants = (): void => {
    tabsRef.current?.scrollIntoView?.({ block: 'center' });
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]?.focus();
  };

  const unresolved =
    shown.unresolved.length > 0 ? (
      <Card variant="strong" className="overflow-hidden" testId="unresolved">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
          <TriangleAlert size={14} aria-hidden />
          <span className="text-sm font-semibold">
            {t('routeUnresolved', lang)} <span className="font-mono text-xs text-fg-3">{shown.unresolved.length}</span>
          </span>
          {headerActions.length > 0 ? <span className="ml-auto flex gap-1.5">{headerActions.map(actionButton)}</span> : null}
        </div>
        <ul>
          {shown.unresolved.map((entry, i) => {
            const gift = indexes.giftById.get(entry.giftId);
            return (
              <li key={`${entry.giftId}-${entry.reason}`} className="flex items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0">
                {gift ? <GiftIcon gift={gift} size={32} judgement={judgements.get(entry.giftId) ?? null} lang={lang} /> : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{giftName(entry.giftId)}</span>
                    <Chip>{t(UNRESOLVED_LABEL[entry.reason], lang)}</Chip>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-fg-2">{pick(entry.detail, lang)}</span>
                    <span className="flex gap-1.5">
                      {(unresolvedActions[i] ?? []).filter((a) => !sharedLabels.has(a.label)).map(actionButton)}
                      {entry.reason === 'pack-conflict' && variants.length > 0 && !variant ? (
                        <Button size="sm" variant="ghost" onClick={seeVariants}>
                          {t('routeVariantSee', lang)}
                          <ChevronRight size={12} aria-hidden />
                        </Button>
                      ) : null}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    ) : null;

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
      {autoHardNotice ? <div className="order-4 lg:order-none">{autoHardNotice}</div> : null}
      <div className="order-6 lg:order-none">
        <Timetable
          plan={shown}
          lastFloor={options.lastFloor}
          hard={hard}
          indexes={indexes}
          judgements={judgements}
          giftTitle={giftTitle}
          packName={packName}
          keywordLabel={(id) => keywordName(id, data.enums, lang)}
          onToggleObserved={variant ? undefined : (giftId) => toggleObserved(giftId, data.rules.giftObservation.max)}
          lang={lang}
        />
      </div>
      {unresolved ? <div className="order-2 lg:order-none">{unresolved}</div> : null}
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
