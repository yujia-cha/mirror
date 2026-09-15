/**
 * Pick the gifts to chase. They are grouped by whether the current deck activates them and drawn
 * as a grid of tiles; the detail sheet behind each name carries the wording the tiles leave out
 * (effect text, every condition, how it is obtained, the recipe). Between the filters and the
 * grid sit the observation slots and the selected-gift chips: a chip opens the sheet, and can be
 * dragged onto a slot to pin the gift for observation.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Link2, RefreshCw, Search, User, X } from 'lucide-react';
import type { AcquisitionKind, GameData, Gift, Keyword, Sin } from '../../core/schema.ts';
import { evaluateConditions, observable } from '../../core/index.ts';
import type { ConditionReport, DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { SIN_LABEL, badgeFor, tierLabel } from '../lib/labels.ts';
import { prioritiseGifts, type GiftEntry, type GiftGroup } from '../lib/gift-priority.ts';
import { blockedGifts, entanglements } from '../lib/entangle.ts';
import { carriedBy } from '../lib/goal-toggle.ts';
import { upgradeChildren } from '../lib/upgrade-children.ts';
import { judgementOf } from '../lib/judgement.ts';
import { useChipDrag } from '../lib/useChipDrag.ts';
import { Badge, Button, Card, FilterSelect } from '../components/ui.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';
import { GiftTileGrid, type GiftTileData } from '../components/GiftGrid.tsx';
import { GiftDetailSheet } from '../components/GiftDetailSheet.tsx';
import { ObserveSlots } from '../components/ObserveSlots.tsx';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
  /** Where to send the player when the deck is empty (the deck tab). */
  onGoDeck?: () => void;
}

type TierFilter = '1' | '2' | '3' | '4' | '5' | 'EX';
type PriceFilter = 'p1' | 'p2' | 'p3' | 'p4';
const PRICE_BANDS: Record<PriceFilter, [number, number]> = { p1: [0, 150], p2: [151, 250], p3: [251, 400], p4: [401, Infinity] };

const GROUPS: { group: GiftGroup; title: 'giftsActive' | 'giftsOther' }[] = [
  { group: 'active', title: 'giftsActive' },
  { group: 'other', title: 'giftsOther' },
];

export function GiftsStep({ data, indexes, stats, lang, onGoDeck }: Props) {
  const deck = useApp((s) => s.deck);
  const wanted = useApp((s) => s.wanted);
  const toggleWanted = useApp((s) => s.toggleWanted);
  const removeWanted = useApp((s) => s.removeWanted);
  const clearWanted = useApp((s) => s.clearWanted);
  const observedGifts = useApp((s) => s.options.observedGifts);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const setOptions = useApp((s) => s.setOptions);
  const observeMax = data.rules.giftObservation.max;

  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState<Keyword | 'all'>('all');
  const [tier, setTier] = useState<TierFilter | 'all'>('all');
  const [acquisition, setAcquisition] = useState<AcquisitionKind | 'all'>('all');
  const [sin, setSin] = useState<Sin | 'all'>('all');
  const [price, setPrice] = useState<PriceFilter | 'all'>('all');
  const [detail, setDetail] = useState<number | null>(null);
  // 「기타」 is the long tail, so it starts folded; 「활성」 opens with the panel.
  const [collapsed, setCollapsed] = useState<Record<GiftGroup, boolean>>({ active: false, other: true });
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
  const childrenOf = useMemo(() => upgradeChildren(data), [data]);

  // Two fusion goals can eat the same ingredient; a state that already holds both still says so.
  const entangled = useMemo(() => entanglements(wanted, indexes, data.rules.fusion.maxShopSlots), [wanted, indexes, data]);
  const entangledIds = useMemo(() => new Set(entangled.keys()), [entangled]);
  // What the current goals rule out: their own ingredients (포함) and the fusions that would fight
  // them over one (얽힘).
  const blocked = useMemo(() => blockedGifts(wanted, indexes, data.rules.fusion.maxShopSlots), [wanted, indexes, data]);

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

  const total = groups.active.length + groups.other.length;
  const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang);
  const judgementFor = (id: number) => judgementOf(conditionByGift.get(id));
  const canObserve = (id: number): boolean => {
    const gift = indexes.giftById.get(id);
    return gift ? observable(gift, data.rules) : false;
  };

  const carryIndex = { indexes, childrenOf, maxShopSlots: data.rules.fusion.maxShopSlots };
  const toggle = (gift: Gift): void => toggleWanted(gift.id, carriedBy(gift, carryIndex));

  // Observation: the slots take a selected gift from the 「+」 list or from a dragged chip. A drop
  // on a filled slot replaces its gift; a drop elsewhere, or of a gift that cannot be observed,
  // does nothing.
  const observeCandidates = wanted.filter((id) => canObserve(id) && !observedGifts.includes(id));
  const pin = (id: number): void => toggleObserved(id, { max: observeMax, observable: canObserve });
  const unpin = (id: number): void => {
    if (observedGifts.includes(id)) toggleObserved(id, { max: observeMax, observable: canObserve });
  };
  const drag = useChipDrag((giftId, slot) => {
    if (slot === null || !canObserve(giftId) || observedGifts.includes(giftId)) return;
    const occupant = observedGifts[slot];
    if (occupant !== undefined) setOptions({ observedGifts: observedGifts.map((id) => (id === occupant ? giftId : id)) });
    else pin(giftId);
  });
  const draggedGift = drag.state.dragging !== null ? indexes.giftById.get(drag.state.dragging) : undefined;

  const tilesFor = (entries: GiftEntry[]): GiftTileData[] =>
    entries.flatMap((entry) => {
      const kids = (childrenOf.get(entry.gift.id) ?? []).filter((g) => g.obtainable || wanted.includes(g.id));
      return [
        { entry },
        ...kids.map((g) => ({ entry: { ...entry, gift: g, reports: conditionByGift.get(g.id) ?? [] }, parent: entry.gift })),
      ];
    });

  const section = (group: GiftGroup, titleKey: 'giftsActive' | 'giftsOther') => {
    const entries = groups[group];
    const tiles = tilesFor(entries);
    // 조합 계승 children come into the grid under their parent, so the parent count read low.
    const shownCount = tiles.length;
    const chosen = tiles.filter((tile) => wanted.includes(tile.entry.gift.id)).length;
    const shut = collapsed[group];
    return (
      <Card className="overflow-hidden" key={group}>
        <button
          type="button"
          onClick={() => setCollapsed((state) => ({ ...state, [group]: !state[group] }))}
          aria-expanded={!shut}
          className="flex h-9 w-full items-center justify-between border-b border-line bg-surface-2 px-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            {t(titleKey, lang)} <span className="font-num text-xs text-fg-3">{shownCount}</span>
            {shut && chosen > 0 ? <Badge tone="neutral">{t('giftsSelected', lang, { n: chosen })}</Badge> : null}
          </span>
          <span className="text-fg-3">{shut ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
        </button>
        {shut ? null : (
          <div className={group === 'other' ? 'max-h-[60vh] overflow-y-auto' : undefined} data-testid={group === 'other' ? 'gift-scroller' : undefined}>
            <GiftTileGrid
              tiles={tiles}
              wanted={wanted}
              entangled={entangledIds}
              blocked={blocked}
              giftName={giftName}
              enums={data.enums}
              lang={lang}
              onToggle={toggle}
              onOpen={setDetail}
            />
          </div>
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
        {onGoDeck ? (
          <Button variant="primary" onClick={onGoDeck}>
            <ChevronLeft size={14} aria-hidden />
            {t('toDeck', lang)}
          </Button>
        ) : null}
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
    body = <div className="flex flex-col gap-2.5">{GROUPS.map(({ group, title }) => section(group, title))}</div>;
  }

  const keywordOptions = data.enums.keywords.map((k) => ({ value: k.id as Keyword, label: pick(k.name, lang) }));
  const sinOptions = data.enums.sins.map((s) => ({ value: s as Sin, label: t(SIN_LABEL[s as Sin], lang) }));
  const acqOptions = (['general', 'packLimited', 'fusionOnly', 'startOnly', 'clearReward', 'hiddenBattle', 'event'] as AcquisitionKind[]).map((k) => ({
    value: k,
    label: t(badgeFor(k).label, lang),
  }));
  // The bands do not overlap, so 「~250」 read as a promise the filter broke: a 100-cost gift is not
  // in `p2`. Each label now names the band it actually keeps.
  const priceOptions: { value: PriceFilter; label: string }[] = [
    { value: 'p1', label: t('priceUpTo', lang, { n: 150 }) },
    { value: 'p2', label: t('priceBand', lang, { from: 151, to: 250 }) },
    { value: 'p3', label: t('priceBand', lang, { from: 251, to: 400 }) },
    { value: 'p4', label: t('priceOver', lang, { n: 400 }) },
  ];

  const detailGift = detail !== null ? indexes.giftById.get(detail) : undefined;

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
      <div className="flex flex-wrap gap-1.5">
        <FilterSelect label={t('filterKeyword', lang)} value={keyword} options={keywordOptions} onChange={setKeyword} allLabel={t('filterAll', lang)} />
        <FilterSelect
          label={t('filterTier', lang)}
          value={tier}
          options={(['1', '2', '3', '4', '5', 'EX'] as TierFilter[]).map((v) => ({ value: v, label: tierLabel(v === 'EX' ? 'EX' : (Number(v) as 1 | 2 | 3 | 4 | 5)) }))}
          onChange={setTier}
          allLabel={t('filterAll', lang)}
        />
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

      <ObserveSlots
        slots={observedGifts}
        max={observeMax}
        candidates={observeCandidates}
        indexes={indexes}
        judgementOf={judgementFor}
        lang={lang}
        onPin={pin}
        onUnpin={unpin}
        dragging={drag.state.dragging !== null}
        over={drag.state.over}
        onHover={drag.setOver}
      />

      {wanted.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2" aria-label={t('giftsSelected', lang, { n: wanted.length })}>
          <span className="mr-0.5 text-xs font-medium text-fg-2">{t('giftsSelected', lang, { n: wanted.length })}</span>
          {wanted.map((id) => {
            const gift = indexes.giftById.get(id);
            const pinned = observedGifts.includes(id);
            return (
              <span
                key={id}
                data-testid="gift-chip"
                data-gift={id}
                data-pinned={pinned || undefined}
                data-entangled={entangledIds.has(id) || undefined}
                {...drag.handleFor(id)}
                style={{ touchAction: 'none' }}
                className={`inline-flex h-7 select-none items-center gap-1 rounded-full border bg-surface pl-1 pr-1 text-xs text-fg ${pinned ? 'border-ink' : 'border-line-strong'} ${
                  drag.state.dragging === id ? 'opacity-40' : ''
                }`}
              >
                {gift ? <GiftIcon gift={gift} size={20} judgement={judgementFor(id)} lang={lang} /> : null}
                <button type="button" onClick={() => setDetail(id)} aria-haspopup="dialog" aria-label={t('giftDetail', lang, { name: giftName(id) })} className="hover:underline">
                  {giftName(id)}
                </button>
                {entangledIds.has(id) ? <Link2 size={11} aria-hidden className="text-fg-2" /> : null}
                <button type="button" onClick={() => removeWanted(id)} aria-label={t('removeFromSelection', lang, { name: giftName(id) })} className="text-fg-3">
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <button type="button" onClick={clearWanted} className="ml-auto text-xs text-fg-3 underline">
            {t('giftsClear', lang)}
          </button>
        </div>
      ) : null}

      {draggedGift
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface p-1 shadow-pop"
              style={{ left: drag.state.x, top: drag.state.y }}
              data-testid="chip-ghost"
              aria-hidden
            >
              <GiftIcon gift={draggedGift} size={32} lang={lang} />
            </div>,
            document.body,
          )
        : null}

      {body}

      {detailGift ? (
        <GiftDetailSheet
          gift={detailGift}
          reports={conditionByGift.get(detailGift.id) ?? []}
          entangled={entangled.get(detailGift.id) ?? []}
          blocked={wanted.includes(detailGift.id) ? undefined : blocked.get(detailGift.id)}
          data={data}
          indexes={indexes}
          lang={lang}
          onToggleWanted={toggle}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}
