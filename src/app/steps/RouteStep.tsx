import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, Eye, Hourglass, Lock, Star, TriangleAlert, X } from 'lucide-react';
import type { GameData, Keyword } from '../../core/schema.ts';
import { planRoute } from '../../core/index.ts';
import type { DeckStats, GameIndexes, PlanOptions, Unresolved } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { keywordName } from '../format.ts';
import { conditionText } from '../condition-text.ts';
import { UNRESOLVED_LABEL, bandOf } from '../lib/labels.ts';
import { planToText } from '../lib/plan-text.ts';
import { Badge, Button, Card, Chip, Notice, SectionTitle, Segmented, Toast } from '../components/ui.tsx';
import { Timetable } from '../components/Timetable.tsx';
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

function actionsFor(entry: Unresolved, options: PlanOptions, lang: Lang, setOptions: (patch: Partial<PlanOptions>) => void) {
  const out: { label: string; run: () => void }[] = [];
  if (entry.reason === 'hard-only' && options.hardFromFloor === null) {
    out.push({ label: t('actionSwitchHard', lang), run: () => setOptions({ hardFromFloor: 1 }) });
  }
  if (entry.reason === 'no-pack-in-range' || entry.reason === 'pack-conflict') {
    const next = options.lastFloor < 10 ? 10 : options.lastFloor < 15 ? 15 : null;
    if (next !== null) out.push({ label: t('actionExtendFloors', lang, { n: next }), run: () => setOptions({ lastFloor: next, hardFromFloor: 1 }) });
    if (options.giftObservationMax < 3) {
      out.push({ label: t('actionObserveMore', lang), run: () => setOptions({ giftObservationMax: options.giftObservationMax + 1 }) });
    }
  }
  return out;
}

export function RouteStep({ data, indexes, stats, lang }: Props) {
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const wanted = useApp((s) => s.wanted);
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);
  const resetOptions = useApp((s) => s.resetOptions);
  const setStep = useApp((s) => s.setStep);
  const [copied, setCopied] = useState(false);

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
          <span className="text-xs text-fg-3">{t('optionObservation', lang)}</span>
          <Segmented
            label={t('optionObservation', lang)}
            value={options.giftObservationMax}
            options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            onChange={(giftObservationMax) => setOptions({ giftObservationMax })}
          />
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
        <button type="button" onClick={resetOptions} className="pb-2 text-xs text-fg-3 underline lg:ml-auto">
          {t('optionReset', lang)}
        </button>
      </div>
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

  const capped = plan.stats.searchCapped;
  const otherWarnings = plan.warnings.filter((w) => w.code !== 'search-capped' && w.code !== 'parallel-requires-hard');

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(planToText(plan, giftName, packName, lang));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const summary = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(
        [
          ['routeRequiredPacks', String(plan.stats.requiredPacks)],
          ['routeStarlight', String(plan.stats.starlight + plan.start.starlight)],
          ['routeCovered', `${plan.stats.coveredWanted}/${plan.stats.totalWanted}`],
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

  const cappedBanner = capped ? (
    <Notice strong icon={<Hourglass size={14} aria-hidden />}>
      <b>{t('routeApprox', lang)}.</b> {pick(plan.warnings.find((w) => w.code === 'search-capped')?.detail, lang)}
    </Notice>
  ) : null;
  const autoHardNotice = autoHard ? <Notice icon={<Eye size={14} aria-hidden />}>{t('optionHardAuto', lang)}</Notice> : null;

  const fusions = (
    <Card className="p-3.5">
      <SectionTitle right={t('routeFuse', lang)}>{t('routeFusions', lang)}</SectionTitle>
      {plan.fusions.length === 0 ? (
        <p className="mt-2 text-xs text-fg-3">—</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {plan.fusions.map((f) => (
            <li key={f.result} className="flex flex-wrap items-center gap-1.5">
              <Badge tone="fuse">{t('acqFuse', lang)}</Badge>
              {f.exceedsShopSlots ? <Badge tone="alert">{t('routeFusionSlots', lang)}</Badge> : null}
              <b>{giftName(f.result)}</b>
              <span className="text-xs text-fg-3">
                ← {f.ingredients.map(giftName).join(' + ')} ·{' '}
                {f.unreachable ? t('routeFusionImpossible', lang) : t('routeFuseAt', lang, { floor: f.earliestFloor })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const general = (
    <Card variant="dashed" className="p-3.5">
      <SectionTitle right={t('routeGeneralNotSure', lang)}>{t('routeGeneralDrops', lang)}</SectionTitle>
      {plan.generalDrops.length === 0 ? (
        <p className="mt-2 text-xs text-fg-3">—</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
          {plan.generalDrops.map((id) => (
            <li key={id} className="inline-flex items-center gap-1.5">
              <Badge tone="maybe">{t('acqMaybeLong', lang)}</Badge>
              {giftName(id)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-fg-3">{t('routeGeneralHint', lang)}</p>
    </Card>
  );

  const conditions = (
    <Card className="p-3.5">
      <SectionTitle right={t('routeConditionsBasis', lang, { n: stats.deployed.length })}>{t('routeConditions', lang)}</SectionTitle>
      {plan.conditions.length === 0 ? (
        <p className="mt-2 text-xs text-fg-3">—</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {plan.conditions.map((report, i) => {
            const judgeable = report.have !== null && report.need !== null;
            return (
              <li key={`${report.giftId}-${i}`} className={`flex items-center gap-2 ${report.satisfied ? '' : 'text-fg-3'}`}>
                {report.satisfied ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
                <span className="min-w-0 flex-1 truncate" title={conditionText(report, data.enums, lang)}>
                  {giftName(report.giftId)} · {conditionText(report, data.enums, lang)}
                </span>
                <span className="font-mono text-xs">{judgeable ? `${report.have}/${report.need}` : t('giftUnjudgeable', lang)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  const unresolved =
    plan.unresolved.length > 0 ? (
      <Card variant="strong" className="overflow-hidden" testId="unresolved">
        <div className="flex h-9 items-center gap-1.5 border-b border-line px-3">
          <TriangleAlert size={14} aria-hidden />
          <span className="text-sm font-semibold">
            {t('routeUnresolved', lang)} <span className="font-mono text-xs text-fg-3">{plan.unresolved.length}</span>
          </span>
        </div>
        <ul>
          {plan.unresolved.map((entry) => (
            <li key={`${entry.giftId}-${entry.reason}`} className="flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{giftName(entry.giftId)}</span>
                <Chip>{t(UNRESOLVED_LABEL[entry.reason], lang)}</Chip>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-fg-2">{pick(entry.detail, lang)}</span>
                <span className="flex gap-1.5">
                  {actionsFor(entry, options, lang, setOptions).map((action) => (
                    <Button key={action.label} size="sm" onClick={action.run}>
                      {action.label}
                      <ChevronRight size={12} aria-hidden />
                    </Button>
                  ))}
                </span>
              </div>
            </li>
          ))}
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

  const observed =
    plan.start.observed.length > 0 ? (
      <Notice icon={<Eye size={14} aria-hidden />}>
        {t('routeObserved', lang)}: {plan.start.observed.map(giftName).join(', ')} · {t('routeStarlight', lang)} {plan.start.starlight}
        {plan.start.starlightVerified ? '' : ` (${t('routeUnverified', lang)})`}
        {plan.start.keyword ? ` · ${t('optionStartKeyword', lang)} ${keywordName(plan.start.keyword, data.enums, lang)}` : ''}
      </Notice>
    ) : null;

  // DOM order is the desktop order; on a phone the summary and the unresolved card come first.
  return (
    <div className="flex flex-col gap-3">
      <div className="order-3 lg:order-none">{optionsBar}</div>
      <div className="order-1 lg:order-none">{summary}</div>
      {cappedBanner ? <div className="order-2 lg:order-none">{cappedBanner}</div> : null}
      {autoHardNotice ? <div className="order-4 lg:order-none">{autoHardNotice}</div> : null}
      {observed ? <div className="order-5 lg:order-none">{observed}</div> : null}
      <div className="order-6 lg:order-none">
        <Timetable plan={plan} lastFloor={options.lastFloor} hard={hard} packName={packName} giftName={giftName} lang={lang} />
      </div>
      {unresolved ? <div className="order-2 lg:order-none">{unresolved}</div> : null}
      <div className="order-7 grid grid-cols-1 gap-3 pb-4 lg:order-none lg:grid-cols-3">
        {fusions}
        {general}
        <div className="flex flex-col gap-3">
          {conditions}
          {notes}
        </div>
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
