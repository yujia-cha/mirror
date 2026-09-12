import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Ban, ChevronDown, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, Star, User, X } from 'lucide-react';
import type { AcquisitionKind, GameData, Gift, Keyword, Sin } from '../../core/schema.ts';
import { evaluateConditions, observable } from '../../core/index.ts';
import type { ConditionReport, DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { keywordName, renderEffect } from '../format.ts';
import { conditionText } from '../condition-text.ts';
import { SIN_LABEL, badgeFor } from '../lib/labels.ts';
import { prioritiseGifts, type GiftEntry, type GiftGroup } from '../lib/gift-priority.ts';
import { useVirtualRows } from '../lib/useVirtualRows.ts';
import { judgementOf } from '../lib/judgement.ts';
import { priorityOf, type Priority } from '../lib/plan-input.ts';
import { Badge, Button, Card, FilterSelect } from '../components/ui.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
}

type TierFilter = '1' | '2' | '3' | '4' | '5' | 'EX';
type PriceFilter = 'p1' | 'p2' | 'p3' | 'p4';
const PRICE_BANDS: Record<PriceFilter, [number, number]> = { p1: [0, 150], p2: [151, 250], p3: [251, 400], p4: [401, Infinity] };

const ROW = 44;
const SUB_ROW = 36;
const DETAIL = 80;

interface Row {
  kind: 'parent' | 'child';
  entry: GiftEntry;
  parent?: Gift;
  height: number;
}

function Progress({ report, lang, enums }: { report: ConditionReport; lang: Lang; enums: GameData['enums'] }) {
  if (report.have === null || report.need === null) return <span className="font-mono text-xs text-fg-3">{t('giftUnjudgeable', lang)}</span>;
  const ok = report.have >= report.need;
  const pct = Math.min(100, Math.round((report.have / report.need) * 100));
  return (
    <span className="flex w-[104px] flex-none items-center gap-1.5" title={conditionText(report, enums, lang)}>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
        <span className={`block h-full ${ok ? 'bg-ink' : 'bg-line-strong'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-mono text-xs ${ok ? 'text-fg' : 'text-fg-3'}`}>
        {report.have}/{report.need}
      </span>
    </span>
  );
}

function progressNumber(report: ConditionReport): string {
  return report.have === null || report.need === null ? '?' : `${report.have}/${report.need}`;
}

export function GiftsStep({ data, indexes, stats, lang }: Props) {
  const deck = useApp((s) => s.deck);
  const wanted = useApp((s) => s.wanted);
  const toggleWanted = useApp((s) => s.toggleWanted);
  const removeWanted = useApp((s) => s.removeWanted);
  const clearWanted = useApp((s) => s.clearWanted);
  const observedGifts = useApp((s) => s.options.observedGifts);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const priority = useApp((s) => s.priority);
  const setPriority = useApp((s) => s.setPriority);
  const fusionGoal = useApp((s) => s.fusionGoal);
  const setFusionGoal = useApp((s) => s.setFusionGoal);
  const setStep = useApp((s) => s.setStep);
  const observeMax = data.rules.giftObservation.max;

  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState<Keyword | 'all'>('all');
  const [tier, setTier] = useState<TierFilter | 'all'>('all');
  const [acquisition, setAcquisition] = useState<AcquisitionKind | 'all'>('all');
  const [sin, setSin] = useState<Sin | 'all'>('all');
  const [price, setPrice] = useState<PriceFilter | 'all'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [jump, setJump] = useState<{ id: number; nonce: number } | null>(null);
  const filtersOn = keyword !== 'all' || tier !== 'all' || acquisition !== 'all' || sin !== 'all' || price !== 'all' || query.trim() !== '';
  const resetFilters = (): void => {
    setQuery('');
    setKeyword('all');
    setTier('all');
    setAcquisition('all');
    setSin('all');
    setPrice('all');
  };

  const conditionByGift = useMemo(() => {
    const reports = evaluateConditions(
      data.gifts.filter((gift) => gift.conditions.length > 0).map((gift) => gift.id),
      stats,
      indexes,
    );
    const map = new Map<number, ConditionReport[]>();
    for (const report of reports) map.set(report.giftId, [...(map.get(report.giftId) ?? []), report]);
    return map;
  }, [data, stats, indexes]);

  // 조합 계승: a child (upgradeOf) never stands alone; it hangs under its parent.
  const childrenOf = useMemo(() => {
    const map = new Map<number, Gift[]>();
    for (const gift of data.gifts) {
      if (gift.upgradeOf === null) continue;
      map.set(gift.upgradeOf, [...(map.get(gift.upgradeOf) ?? []), gift]);
    }
    return map;
  }, [data]);

  const matchesFilters = (gift: Gift): boolean => {
    const needle = query.trim().toLowerCase();
    if (needle && !`${gift.name.ko} ${gift.name.en}`.toLowerCase().includes(needle)) return false;
    if (keyword !== 'all' && gift.keyword !== keyword) return false;
    if (tier !== 'all' && String(gift.tier) !== tier) return false;
    if (acquisition !== 'all' && gift.acquisition.kind !== acquisition) return false;
    if (sin !== 'all' && gift.sin !== sin) return false;
    if (price !== 'all') {
      const [lo, hi] = PRICE_BANDS[price];
      if (gift.price === null || gift.price < lo || gift.price > hi) return false;
    }
    return true;
  };

  const groups = useMemo(() => {
    const candidates = data.gifts.filter((gift) => gift.obtainable || wanted.includes(gift.id));
    const parents = candidates.filter((gift) => {
      const isChild = gift.upgradeOf !== null && indexes.giftById.has(gift.upgradeOf);
      if (isChild) return false;
      const kids = childrenOf.get(gift.id) ?? [];
      return matchesFilters(gift) || kids.some(matchesFilters);
    });
    return prioritiseGifts(parents, conditionByGift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, indexes, wanted, conditionByGift, childrenOf, query, keyword, tier, acquisition, sin, price]);

  const total = groups.active.length + groups.near.length + groups.other.length;
  useEffect(() => {
    if (!jump) return;
    const el = document.getElementById(`gift-${jump.id}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  }, [jump, otherOpen]);
  const jumpTo = (id: number): void => {
    const gift = indexes.giftById.get(id);
    const parentId = gift?.upgradeOf ?? id;
    if (groups.other.some((e) => e.gift.id === parentId)) setOtherOpen(true);
    setJump({ id, nonce: Date.now() });
  };
  const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang);

  const toggle = (gift: Gift): void => toggleWanted(gift.id, (childrenOf.get(gift.id) ?? []).map((g) => g.id));

  const renderRow = (row: Row): React.ReactNode => {
    const gift = row.entry.gift;
    if (row.kind === 'child') {
      const parentSelected = row.parent ? wanted.includes(row.parent.id) : false;
      const selected = wanted.includes(gift.id);
      const { badge, label } = badgeFor(gift.acquisition.kind);
      return (
        <div
          id={`gift-${gift.id}`}
          className="flex h-9 items-center gap-2 border-b border-t border-dashed border-line bg-surface-2 px-3 pl-7"
          data-testid="gift-child"
          title={row.parent ? t('giftSubOf', lang, { parent: pick(row.parent.name, lang) }) : undefined}
        >
          <input
            type="checkbox"
            checked={parentSelected || selected}
            disabled={parentSelected}
            onChange={() => toggleWanted(gift.id)}
            aria-label={pick(gift.name, lang)}
            className="h-4 w-4 flex-none accent-[var(--color-ink)]"
          />
          <ArrowRight size={12} aria-hidden className="flex-none text-fg-3" />
          <GiftIcon gift={gift} size={20} judgement={judgementOf(conditionByGift.get(gift.id))} lang={lang} />
          <span className="min-w-0 flex-1 truncate text-sm text-fg-2">{pick(gift.name, lang)}</span>
          <span className="font-mono text-xs text-fg-3">T{gift.tier ?? '?'}</span>
          {parentSelected ? <Badge tone="sure">{t('giftIncluded', lang)}</Badge> : <Badge tone={badge}>{t(label, lang)}</Badge>}
          {gift.hardOnly ? <Badge tone="hard">{t('hardOnly', lang)}</Badge> : null}
        </div>
      );
    }
    const selected = wanted.includes(gift.id);
    const { badge, label } = badgeFor(gift.acquisition.kind);
    const lack = row.entry.lack;
    const lackName =
      lack && lack.subject.kind === 'keyword'
        ? keywordName(lack.subject.ids[0] as never, data.enums, lang)
        : lack && lack.subject.kind === 'faction'
          ? lack.subject.ids.map((id) => pick(data.enums.factions.find((f) => f.id === id)?.name, lang)).join('/')
          : null;
    const open = expanded === gift.id;
    return (
      <div className="border-b border-line" data-testid="gift-row" id={`gift-${gift.id}`}>
        <div className="flex min-h-11 items-center gap-2 px-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggle(gift)}
            aria-label={pick(gift.name, lang)}
            className="h-[18px] w-[18px] flex-none accent-[var(--color-ink)]"
          />
          <GiftIcon gift={gift} size={32} judgement={judgementOf(row.entry.reports)} lang={lang} />
          <button type="button" onClick={() => setExpanded(open ? null : gift.id)} aria-expanded={open} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-fg">
            {pick(gift.name, lang)}
          </button>
          <span className="font-mono text-xs text-fg-3">T{gift.tier ?? '?'}</span>
          <span className="hidden text-xs text-fg-2 sm:inline">{keywordName(gift.keyword, data.enums, lang)}</span>
          <Badge tone={badge}>{t(label, lang)}</Badge>
          {gift.hardOnly ? <Badge tone="hard">{t('hardOnly', lang)}</Badge> : null}
          {lack && lackName && lack.have !== null && lack.need !== null ? (
            <span className="whitespace-nowrap text-xs font-medium text-fg-2">{t('giftLack', lang, { name: lackName, n: lack.need - lack.have })}</span>
          ) : null}
          {row.entry.reports[0] ? (
            <>
              <span className="font-mono text-xs text-fg-3 sm:hidden">{progressNumber(row.entry.lack ?? row.entry.reports[0])}</span>
              <span className="hidden sm:flex">
                <Progress report={row.entry.lack ?? row.entry.reports[0]} lang={lang} enums={data.enums} />
              </span>
            </>
          ) : null}
        </div>
        {open ? (
          <div className="flex flex-col gap-1.5 px-3 pb-2.5 pl-10 text-xs text-fg-2">
            <div className="line-clamp-2">{renderEffect(gift.desc, data.enums, lang)}</div>
            {gift.fusion && gift.fusion.recipes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-fg-3">{t('giftMaterials', lang)}</span>
                {gift.fusion.recipes[0]!.ingredients.map((id, i) => (
                  <span key={`${id}-${i}`} className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                    {giftName(id)}
                  </span>
                ))}
                {selected ? (
                  <label className="ml-auto inline-flex items-center gap-1.5 text-fg" title={t('fusionGoalHint', lang)}>
                    <input
                      type="checkbox"
                      checked={fusionGoal[gift.id] !== 'resultOnly'}
                      onChange={(event) => setFusionGoal(gift.id, event.target.checked ? 'withIngredients' : 'resultOnly')}
                      aria-label={`${pick(gift.name, lang)} ${t('fusionGoalIngredients', lang)}`}
                      className="h-[14px] w-[14px] accent-[var(--color-ink)]"
                    />
                    {t('fusionGoalIngredients', lang)}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const rowsFor = (entries: GiftEntry[]): Row[] =>
    entries.flatMap((entry) => {
      const kids = (childrenOf.get(entry.gift.id) ?? []).filter((g) => g.obtainable || wanted.includes(g.id));
      return [
        { kind: 'parent' as const, entry, height: ROW + (expanded === entry.gift.id ? DETAIL : 0) },
        ...kids.map((g) => ({ kind: 'child' as const, entry: { ...entry, gift: g }, parent: entry.gift, height: SUB_ROW })),
      ];
    });

  const section = (group: GiftGroup, titleKey: 'giftsActive' | 'giftsNear' | 'giftsOther', collapsed?: boolean, onToggle?: () => void) => {
    const entries = groups[group];
    const rows = rowsFor(entries);
    const chosen = rows.filter((row) => wanted.includes(row.entry.gift.id)).length;
    const jumpIndex = jump ? rows.findIndex((row) => row.entry.gift.id === jump.id) : -1;
    return (
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex h-9 w-full items-center justify-between border-b border-line bg-surface-2 px-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            {t(titleKey, lang)} <span className="font-mono text-xs text-fg-3">{entries.length}</span>
            {collapsed && chosen > 0 ? <Badge tone="neutral">{t('giftsSelected', lang, { n: chosen })}</Badge> : null}
          </span>
          <span className="text-fg-3">{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
        </button>
        {collapsed ? null : group === 'other' ? (
          <VirtualList rows={rows} renderRow={renderRow} lang={lang} scrollTo={jumpIndex >= 0 && jump ? { index: jumpIndex, nonce: jump.nonce } : null} />
        ) : (
          rows.map((row) => <div key={`${row.kind}-${row.entry.gift.id}`}>{renderRow(row)}</div>)
        )}
      </Card>
    );
  };

  let body: React.ReactNode;
  if (deck.length === 0) {
    body = (
      <Card className="flex flex-col items-center gap-2.5 px-4 py-8 text-center">
        <User size={28} className="text-fg-3" aria-hidden />
        <div className="text-sm font-semibold">{t('giftsDeckEmpty', lang)}</div>
        <div className="text-xs text-fg-3">{t('giftsDeckEmptyHint', lang)}</div>
        <Button variant="primary" onClick={() => setStep(1)}>
          <ChevronLeft size={14} aria-hidden />
          {t('toDeck', lang)}
        </Button>
      </Card>
    );
  } else if (total === 0) {
    body = (
      <Card className="flex flex-col items-center gap-2.5 px-4 py-8 text-center">
        <Search size={28} className="text-fg-3" aria-hidden />
        <div className="text-sm font-semibold">{t('giftsNoMatch', lang)}</div>
        {query.trim() ? <div className="text-xs text-fg-3">「{query.trim()}」</div> : null}
        <Button onClick={resetFilters}>
          <RefreshCw size={14} aria-hidden />
          {t('filterReset', lang)}
        </Button>
      </Card>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2.5">
        {section('active', 'giftsActive')}
        {section('near', 'giftsNear')}
        {section('other', 'giftsOther', !otherOpen, () => setOtherOpen((v) => !v))}
      </div>
    );
  }

  const keywordOptions = data.enums.keywords.map((k) => ({ value: k.id as Keyword, label: pick(k.name, lang) }));
  const sinOptions = data.enums.sins.map((s) => ({ value: s as Sin, label: t(SIN_LABEL[s as Sin], lang) }));
  const acqOptions = (['general', 'packLimited', 'fusionOnly', 'startOnly', 'clearReward', 'hiddenBattle', 'event'] as AcquisitionKind[]).map((k) => ({
    value: k,
    label: t(badgeFor(k).label, lang),
  }));
  const priceOptions: { value: PriceFilter; label: string }[] = [
    { value: 'p1', label: t('priceUpTo', lang, { n: 150 }) },
    { value: 'p2', label: t('priceUpTo', lang, { n: 250 }) },
    { value: 'p3', label: t('priceUpTo', lang, { n: 400 }) },
    { value: 'p4', label: t('priceOver', lang, { n: 400 }) },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-surface px-2.5 text-sm">
        <Search size={14} aria-hidden className="flex-none text-fg-3" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('giftsSearch', lang)}
          aria-label={t('giftsSearch', lang)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
        />
      </label>
      <div className="scroll-x -mx-4 flex gap-1.5 px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        <FilterSelect label={t('filterKeyword', lang)} value={keyword} options={keywordOptions} onChange={setKeyword} allLabel={t('filterAll', lang)} />
        <FilterSelect label={t('filterTier', lang)} value={tier} options={(['1', '2', '3', '4', '5', 'EX'] as TierFilter[]).map((v) => ({ value: v, label: `T${v}` }))} onChange={setTier} allLabel={t('filterAll', lang)} />
        <FilterSelect label={t('filterAcquisition', lang)} value={acquisition} options={acqOptions} onChange={setAcquisition} allLabel={t('filterAll', lang)} />
        <FilterSelect label={t('filterSin', lang)} value={sin} options={sinOptions} onChange={setSin} allLabel={t('filterAll', lang)} />
        <FilterSelect label={t('filterPrice', lang)} value={price} options={priceOptions} onChange={setPrice} allLabel={t('filterAll', lang)} />
        {filtersOn ? (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            <RefreshCw size={12} aria-hidden />
            {t('filterReset', lang)}
          </Button>
        ) : null}
      </div>

      {wanted.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2" aria-label={t('giftsSelected', lang, { n: wanted.length })}>
          <span className="mr-0.5 text-xs font-medium text-fg-2">{t('giftsSelected', lang, { n: wanted.length })}</span>
          {wanted.map((id) => {
            const gift = indexes.giftById.get(id);
            const pinned = observedGifts.includes(id);
            const canObserve = gift ? observable(gift, data.rules) : false;
            const full = !pinned && observedGifts.length >= observeMax;
            const why = !canObserve ? t('giftsObserveNotAllowed', lang) : full ? t('giftsObserveFull', lang, { max: observeMax }) : t('giftsObserve', lang, { name: giftName(id) });
            const level = priorityOf(priority, id);
            const nextLevel: Priority = level === 'normal' ? 'must' : level === 'must' ? 'skip' : 'normal';
            const levelLabel = t(level === 'must' ? 'priorityMust' : level === 'skip' ? 'prioritySkip' : 'priorityNormal', lang);
            return (
              <span
                key={id}
                data-priority={level}
                className={`inline-flex h-7 items-center gap-1 rounded-full border bg-surface pl-1 pr-1 text-xs text-fg ${
                  level === 'must' ? 'border-ink' : level === 'skip' ? 'border-line opacity-60' : 'border-line-strong'
                }`}
              >
                {gift ? <GiftIcon gift={gift} size={20} judgement={judgementOf(conditionByGift.get(id))} lang={lang} /> : null}
                <button type="button" onClick={() => jumpTo(id)} aria-label={t('giftGoTo', lang, { name: giftName(id) })} className={`hover:underline ${level === 'skip' ? 'line-through' : ''}`}>
                  {giftName(id)}
                </button>
                <button
                  type="button"
                  onClick={() => setPriority(id, nextLevel)}
                  aria-label={t('priorityOf', lang, { name: giftName(id), value: levelLabel })}
                  title={t('priorityOf', lang, { name: giftName(id), value: levelLabel })}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${level === 'must' ? 'bg-ink text-ink-fg' : level === 'skip' ? 'text-fg' : 'text-fg-3'}`}
                >
                  {level === 'skip' ? <Ban size={11} /> : <Star size={11} fill={level === 'must' ? 'currentColor' : 'none'} />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleObserved(id, observeMax)}
                  disabled={!canObserve || full}
                  aria-pressed={pinned}
                  aria-label={t('giftsObserve', lang, { name: giftName(id) })}
                  title={why}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${pinned ? 'bg-ink text-ink-fg' : 'text-fg-3'} disabled:opacity-30`}
                >
                  <Eye size={11} />
                </button>
                <button type="button" onClick={() => removeWanted(id)} aria-label={t('removeFromSelection', lang, { name: giftName(id) })} className="text-fg-3">
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <span className="text-xs text-fg-3">{t('giftsObserveHint', lang, { n: observedGifts.length, max: observeMax })}</span>
          <button type="button" onClick={clearWanted} className="ml-auto text-xs text-fg-3 underline">
            {t('giftsClear', lang)}
          </button>
        </div>
      ) : null}

      {body}

      <div className="mt-auto hidden justify-between pb-4 lg:flex">
        <Button variant="ghost" onClick={() => setStep(1)}>
          <ChevronLeft size={14} aria-hidden />1 {t('step1', lang)}
        </Button>
        <Button variant="primary" disabled={deck.length === 0} onClick={() => setStep(3)}>
          3 {t('step3', lang)}
          <ChevronRight size={14} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function VirtualList({
  rows,
  renderRow,
  lang,
  scrollTo,
}: {
  rows: Row[];
  renderRow: (row: Row) => React.ReactNode;
  lang: Lang;
  scrollTo: { index: number; nonce: number } | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const heights = useMemo(() => rows.map((r) => r.height), [rows]);
  const expanded = rows.some((r) => r.height > ROW);
  const { start, end, padTop, padBottom } = useVirtualRows(heights, ref, expanded ? 10 : 6);
  useEffect(() => {
    if (!scrollTo || !ref.current) return;
    let offset = 0;
    for (let i = 0; i < scrollTo.index; i += 1) offset += heights[i] ?? 0;
    ref.current.scrollTop = Math.max(0, offset - 80);
  }, [scrollTo, heights]);
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-1 text-right text-xs text-fg-3">
        {t('giftsShowing', lang, { total: rows.length, from: Math.min(rows.length, start + 1), to: Math.min(rows.length, end) })}
      </div>
      <div ref={ref} className="max-h-[60vh] overflow-y-auto" data-testid="virtual-list">
        <div style={{ height: padTop }} />
        {rows.slice(start, end).map((row) => (
          <div key={`${row.kind}-${row.entry.gift.id}`}>{renderRow(row)}</div>
        ))}
        <div style={{ height: padBottom }} />
      </div>
    </div>
  );
}
