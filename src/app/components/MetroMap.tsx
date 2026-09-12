/**
 * The route as a metro line. Floors are stations on one line; a pack pinned to a floor is a solid
 * block over that station, packs that may sit on any floor of a window ride one dashed segment
 * together (any order), and windows that only partly overlap get their own lane with the
 * planner's suggested stops marked. Each segment carries a label card with its packs (card and
 * name) and their pickups; a pack card opens the pack's gift list.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, MapPin, Star, X } from 'lucide-react';
import type { ObservedGift, RoutePlan } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { MAX_FLOOR } from '../lib/timetable.ts';
import { segmentsFor, stackBlocks, suggestedOrder, type Segment } from '../lib/metro.ts';
import { useElementWidth } from '../lib/useElementWidth.ts';
import { DetailSurface, ObservedDetailBody, type DetailMode } from './BlockDetail.tsx';
import { GiftIcon } from './GiftIcon.tsx';
import { PackCard } from './PackCard.tsx';
import { PackSheetBody, type PackContext } from './PackSheet.tsx';
import { Button } from './ui.tsx';

/** The run in progress as the map draws it, plus the floor pick for a pack being recorded. */
export interface MetroRun {
  currentFloor: number;
  /** The pack whose entry floor is being chosen on the stations, or null. */
  selecting: number | null;
  onSelectFloor: (floor: number) => void;
  onCancel: () => void;
}

export interface MetroMapProps {
  plan: RoutePlan;
  ctx: PackContext;
  keywordLabel: (id: NonNullable<RoutePlan['start']['keyword']>) => string;
  run?: MetroRun;
}

type Open = { kind: 'pack'; packId: number; key: string; mode: DetailMode } | { kind: 'observed'; giftId: number; mode: DetailMode };

const BANDS: [number, number][] = [
  [1, 5],
  [6, 10],
  [11, 15],
];
const BAND_KEY = ['optionBandHard', 'optionBandParallel', 'optionBandExtreme'] as const;
/** A one-row label card, until it has been measured. */
const EST_CARD_H = 141;

function bandFill(band: 0 | 1 | 2): string {
  return band === 2 ? 'url(#metro-hatch)' : band === 1 ? 'var(--color-surface-2)' : 'transparent';
}

function segmentTitle(segment: Segment, lang: Lang): string {
  if (segment.passed) return t('runVisited', lang, { floor: segment.from });
  if (segment.fixed) return t('routeFixedFloor', lang, { floor: segment.from });
  if (segment.partial) return t('routeSuggestOrder', lang, { from: segment.from, to: segment.to, order: suggestedOrder(segment).join(' → ') });
  return segment.packs.length > 1
    ? t('routeSegmentMany', lang, { from: segment.from, to: segment.to, n: segment.packs.length })
    : t('routeSegmentOne', lang, { from: segment.from, to: segment.to });
}

function Station({
  cx,
  cy,
  r,
  half,
  floor,
  passed = false,
  current = false,
  selectable = false,
  selectLabel,
  onSelect,
}: {
  cx: number;
  cy: number;
  r: number;
  half: boolean;
  floor: number;
  /** Run progress: already played, or the floor about to be entered. */
  passed?: boolean;
  current?: boolean;
  /** A pack's entry floor is being chosen and this floor can take it. */
  selectable?: boolean;
  selectLabel?: string;
  onSelect?: () => void;
}) {
  const interactive = selectable && onSelect !== undefined;
  return (
    <g
      data-testid="station"
      data-floor={floor}
      data-overlap={half || undefined}
      data-passed={passed || undefined}
      data-current={current || undefined}
      data-selectable={selectable || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? selectLabel : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } } : undefined}
      className={interactive ? 'cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-[3]' : undefined}
    >
      {interactive ? <circle cx={cx} cy={cy} r={r + 7} fill="var(--color-ink)" fillOpacity={0.12} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 2" /> : null}
      {current && !interactive ? <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="var(--color-fg)" strokeWidth={1.5} /> : null}
      <circle cx={cx} cy={cy} r={r} fill={passed ? 'var(--color-fg)' : 'var(--color-surface)'} stroke="var(--color-fg)" strokeWidth={2} />
      {half && !passed ? <path d={`M${cx} ${cy - r} A${r} ${r} 0 0 0 ${cx} ${cy + r} Z`} fill="var(--color-fg)" /> : null}
      {passed ? <path d={`M${cx - 3.5} ${cy} l2.5 2.5 l4.5 -5`} fill="none" stroke="var(--color-surface)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </g>
  );
}

/** The app plays floors 1-5 on Hard, 6-10 in 평행중첩 and 11-15 on EXTREME. */
function bandMode(floor: number): 'hard' | 'parallel' | 'extreme' {
  return floor >= 11 ? 'extreme' : floor >= 6 ? 'parallel' : 'hard';
}

function ObservedTile({ entry, ctx, onPress }: { entry: ObservedGift; ctx: PackContext; onPress?: () => void }) {
  const gift = ctx.indexes.giftById.get(entry.giftId);
  if (!gift) return null;
  const name = pick(gift.name, ctx.lang);
  const why = entry.pinned
    ? t('routeObservedPinned', ctx.lang)
    : entry.freedPack !== null
      ? t('routeObservedFrees', ctx.lang, { pack: ctx.packName(entry.freedPack) })
      : t('routeObservedRescue', ctx.lang);
  const label = entry.pinned ? t('routeObservedPinned', ctx.lang) : t('routeObservedRecommended', ctx.lang);
  const body = (
    <>
      <span className="relative">
        <GiftIcon gift={gift} size={32} judgement={ctx.judgements.get(entry.giftId) ?? null} must={ctx.isMust(entry.giftId)} lang={ctx.lang} />
        <span className={`absolute -right-1 -top-1 rounded-full border border-line p-0.5 ${entry.pinned ? 'bg-ink text-ink-fg' : 'bg-surface text-fg-2'}`} aria-hidden>
          <Eye size={9} />
        </span>
      </span>
      <span className="text-xs text-fg">{name}</span>
      <span className={`rounded-full px-1 text-[9px] leading-[13px] ${entry.pinned ? 'bg-ink text-ink-fg' : 'border border-line text-fg-2'}`}>{label}</span>
    </>
  );
  const title = `${name} · ${t('routeObserved', ctx.lang)} · ${why}`;
  return onPress ? (
    <button type="button" onClick={onPress} aria-pressed={entry.pinned} aria-label={t('routeObservedToggle', ctx.lang, { name })} title={title} data-testid="observed-tile" className="inline-flex items-center gap-1.5 rounded-sm px-1 hover:bg-surface-2">
      {body}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1.5" title={title} data-testid="observed-tile">
      {body}
    </span>
  );
}

export function MetroMap({ plan, ctx, keywordLabel, run }: MetroMapProps) {
  const { lang } = ctx;
  const metro = segmentsFor(plan);
  const [open, setOpen] = useState<Open | null>(null);
  const close = (): void => setOpen(null);

  // Choosing a pack's entry floor: only stations that offer the pack respond; Escape cancels.
  const selecting = run?.selecting ?? null;
  const selectable = (floor: number): boolean =>
    selecting !== null && (ctx.indexes.packsByFloor[bandMode(floor)].get(floor) ?? []).includes(selecting);
  useEffect(() => {
    if (selecting === null || !run) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') run.onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting, run]);
  const stationProps = (floor: number) => ({
    passed: run !== undefined && floor < run.currentFloor,
    current: run !== undefined && floor === run.currentFloor,
    selectable: selectable(floor),
    selectLabel: selecting !== null ? t('runSelectFloor', lang, { floor, pack: ctx.packName(selecting) }) : undefined,
    onSelect: run ? () => run.onSelectFloor(floor) : undefined,
  });
  const selectBanner =
    run && selecting !== null ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-xs" data-testid="select-banner" role="status">
        <MapPin size={13} aria-hidden />
        <span className="font-medium">{t('runSelecting', lang, { pack: ctx.packName(selecting) })}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={run.onCancel}>
          <X size={12} aria-hidden />
          {t('runSelectCancel', lang)}
        </Button>
      </div>
    ) : null;
  const detailFor = (key: string, mode: DetailMode): ReactNode => {
    if (!open || open.mode !== mode) return null;
    if (open.kind === 'pack' && open.key === key) {
      return (
        <DetailSurface mode={mode} label={ctx.packName(open.packId)} closeLabel={t('routeClose', lang)} onClose={close}>
          <PackSheetBody packId={open.packId} ctx={ctx} />
        </DetailSurface>
      );
    }
    if (open.kind === 'observed' && key === `observed-${open.giftId}`) {
      const entry = plan.start.observed.find((o) => o.giftId === open.giftId);
      return entry ? (
        <DetailSurface mode={mode} label={pick(ctx.indexes.giftById.get(entry.giftId)?.name, lang)} closeLabel={t('routeClose', lang)} onClose={close}>
          <ObservedDetailBody entry={entry} ctx={ctx} />
        </DetailSurface>
      ) : null;
    }
    return null;
  };
  const packEntry = (segment: Segment, pack: Segment['packs'][number], mode: DetailMode, compact: boolean): ReactNode => {
    const theme = ctx.indexes.packById.get(pack.packId);
    if (!theme) return null;
    const key = `${segment.key}:${pack.packId}`;
    const icons = pack.gifts.map((giftId) => {
      const gift = ctx.indexes.giftById.get(giftId);
      return gift ? <GiftIcon key={giftId} gift={gift} size={20} judgement={ctx.judgements.get(giftId) ?? null} must={ctx.isMust(giftId)} title={ctx.giftTitle(giftId)} lang={lang} /> : null;
    });
    return (
      <div key={key} className={`relative flex min-w-0 ${compact ? 'flex-row items-center gap-1.5' : 'flex-col items-center gap-1'}`} data-testid="segment-pack" data-pack={pack.packId}>
        <PackCard pack={theme} size={compact ? 20 : 28} caption={!compact} selected={ctx.preferred.has(pack.packId)} onOpen={() => setOpen({ kind: 'pack', packId: pack.packId, key, mode })} lang={lang} />
        {compact ? <span className="truncate text-xs font-medium">{pick(theme.name, lang)}</span> : null}
        <span className="flex flex-wrap justify-center gap-0.5">{icons}</span>
        {detailFor(key, mode)}
      </div>
    );
  };

  // ---- start row: keyword and observations ----
  const startGift = plan.start.startGift ? ctx.indexes.giftById.get(plan.start.startGift) : undefined;
  const startKeyword = plan.start.keyword ? keywordLabel(plan.start.keyword) : null;
  const startRow = (mode: DetailMode): ReactNode =>
    startGift || startKeyword || plan.start.observed.length > 0 ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-xs text-fg-2" data-testid="start-cell">
        {startGift ? (
          <span className="inline-flex items-center gap-1.5" title={t('routeStartGift', lang)}>
            <GiftIcon gift={startGift} size={20} judgement={ctx.judgements.get(startGift.id) ?? null} lang={lang} />
            {pick(startGift.name, lang)}
          </span>
        ) : startKeyword ? (
          <span className="inline-flex items-center gap-1" title={t('optionStartKeyword', lang)}>
            <Star size={11} aria-hidden className="text-fg-3" />
            {t('routeStart', lang)} {startKeyword}
          </span>
        ) : null}
        {plan.start.observed.map((entry) => (
          <span key={entry.giftId} className="relative inline-flex">
            <ObservedTile
              entry={entry}
              ctx={ctx}
              onPress={
                mode === 'sheet'
                  ? () => setOpen({ kind: 'observed', giftId: entry.giftId, mode })
                  : ctx.onToggleObserved
                    ? () => ctx.onToggleObserved?.(entry.giftId)
                    : undefined
              }
            />
            {detailFor(`observed-${entry.giftId}`, mode)}
          </span>
        ))}
      </div>
    ) : null;

  // ---- desktop: horizontal line ----
  const deskRef = useRef<HTMLDivElement>(null);
  const W = useElementWidth(deskRef, 1160);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const [key, el] of cardRefs.current) {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) next[key] = h;
    }
    setCardHeights((prev) => {
      const keys = Object.keys(next);
      return keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]) ? prev : next;
    });
  }, [plan, W]);
  const LEFT = 60;
  const st = (W - LEFT - 20) / MAX_FLOOR;
  const x = (f: number): number => LEFT + (f - 1) * st + st / 2;
  const cards = metro.segments.map((segment) => {
    const span = segment.to - segment.from + 1;
    let cw = st * span - 10;
    if (segment.fixed) cw = Math.max(cw, 110);
    else if (span === 2 && segment.packs.length > 1) cw = Math.max(cw, 170);
    let cl = x(segment.from) - st / 2 + 5;
    if (cl + cw > W - 8) cl = W - 8 - cw;
    return { segment, cl, cw };
  });
  // Label cards stack like a skyline: a card only climbs over the cards it overlaps horizontally,
  // by their measured height, so a two-row card in one place does not lift the whole map.
  const heightOf = (key: string): number => cardHeights[key] ?? EST_CARD_H;
  // Wide cards take the baseline first so a one-floor card climbs over them, not the reverse.
  const order = cards.map((_, i) => i).sort((a, b) => cards[b]!.cw - cards[a]!.cw || cards[a]!.segment.from - cards[b]!.segment.from);
  const stacked = stackBlocks(order.map((i) => cards[i]!), (c) => [c.cl, c.cl + c.cw], (c) => heightOf(c.segment.key), 8);
  const offsets = cards.map(() => 0);
  order.forEach((cardIndex, k) => {
    offsets[cardIndex] = stacked[k]!;
  });
  const ranks = [...new Set(offsets)].sort((a, b) => a - b);
  const deskLanes = offsets.map((o) => ranks.indexOf(o));
  const skyline = Math.max(EST_CARD_H, ...cards.map((c, i) => offsets[i]! + heightOf(c.segment.key)));
  const LINE_Y = 40 + skyline + 42;
  const H = LINE_Y + 46;
  const desktop = (
    <div className="hidden lg:block" data-testid="metro-columns">
      <div ref={deskRef} className="relative w-full" style={{ height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute left-0 top-0" aria-hidden={selecting === null}>
          <defs>
            <pattern id="metro-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
              <rect width="7" height="7" fill="var(--color-surface)" />
              <rect width="1" height="7" x="6" fill="var(--color-line)" />
            </pattern>
          </defs>
          {BANDS.map(([a, b], i) => (
            <g key={a}>
              <rect x={x(a) - st / 2} y={0} width={st * (b - a + 1)} height={H} fill={bandFill(i as 0 | 1 | 2)} />
              <text x={(x(a) + x(b)) / 2} y={18} textAnchor="middle" fontSize={11} fill="var(--color-fg-2)">
                {t(BAND_KEY[i]!, lang)}
              </text>
            </g>
          ))}
          <line x1={LEFT} y1={LINE_Y} x2={W - 20} y2={LINE_Y} stroke="var(--color-line-strong)" strokeWidth={4} />
          <circle cx={LEFT - 24} cy={LINE_Y} r={9} fill="var(--color-ink)" />
          <text x={LEFT - 24} y={LINE_Y + 24} textAnchor="middle" fontSize={11} fill="var(--color-fg-2)">
            {t('routeStart', lang)}
          </text>
          {Array.from({ length: MAX_FLOOR }, (_, i) => i + 1).map((f) => (
            <g key={f}>
              <Station cx={x(f)} cy={LINE_Y} r={7} half={metro.overlap.has(f)} floor={f} {...stationProps(f)} />
              <text x={x(f)} y={LINE_Y + 24} textAnchor="middle" fontSize={12} fontFamily="var(--font-mono)" fill="var(--color-fg)" fontWeight={run && f === run.currentFloor ? 700 : undefined}>
                {f}
              </text>
            </g>
          ))}
          {cards.map(({ segment }, i) => {
            const y = LINE_Y - 28 - offsets[i]!;
            const x1 = x(segment.from);
            const x2 = x(segment.to);
            return (
              <g key={segment.key} data-testid="segment-line" data-from={segment.from} data-to={segment.to} data-lane={deskLanes[i]}>
                {segment.fixed ? (
                  <rect x={x1 - st / 2 + 6} y={y - 9} width={st - 12} height={18} rx={4} fill="var(--color-ink)" />
                ) : (
                  <>
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--color-fg-2)" strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" />
                    <circle cx={x1} cy={y} r={4} fill="var(--color-surface)" stroke="var(--color-fg-2)" strokeWidth={2} />
                    <circle cx={x2} cy={y} r={4} fill="var(--color-surface)" stroke="var(--color-fg-2)" strokeWidth={2} />
                    {segment.partial ? segment.packs.map((p) => <circle key={p.packId} cx={x(p.floor)} cy={y} r={7} fill="var(--color-ink)" data-testid="suggested" data-floor={p.floor} />) : null}
                  </>
                )}
                {Array.from({ length: segment.to - segment.from + 1 }, (_, k) => segment.from + k).map((f) => (
                  <line key={f} x1={x(f)} y1={y + 8} x2={x(f)} y2={LINE_Y - 8} stroke="var(--color-line-strong)" strokeWidth={1} strokeDasharray="2 3" />
                ))}
              </g>
            );
          })}
        </svg>
        {cards.map(({ segment, cl, cw }, i) => {
          const y = LINE_Y - 28 - offsets[i]!;
          return (
            <div
              key={segment.key}
              ref={(el) => {
                if (el) cardRefs.current.set(segment.key, el);
                else cardRefs.current.delete(segment.key);
              }}
              className={`absolute flex flex-col gap-1.5 rounded-md px-2 py-1.5 shadow-card ${segment.passed ? 'border border-ink bg-surface-2' : segment.fixed ? 'border border-ink bg-surface' : 'border-[1.5px] border-dashed border-fg-2 bg-surface'}`}
              style={{ left: cl, width: cw, bottom: H - y + 14 }}
              data-testid="segment"
              data-from={segment.from}
              data-to={segment.to}
              data-partial={segment.partial || undefined}
              data-passed={segment.passed || undefined}
              data-lane={deskLanes[i]}
            >
              <div className="truncate text-xs text-fg-2">{segmentTitle(segment, lang)}</div>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">{segment.packs.map((p) => packEntry(segment, p, 'popover', false))}</div>
            </div>
          );
        })}
      </div>
      {startRow('popover')}
    </div>
  );

  // ---- phone: vertical line ----
  const phoneRef = useRef<HTMLDivElement>(null);
  const PW = useElementWidth(phoneRef, 342);
  const TOP = 30;
  const SP = 64;
  const LX = 36;
  const y = (f: number): number => TOP + (f - 1) * SP + SP / 2;
  const PH = TOP + MAX_FLOOR * SP + 10;
  const LANE_W = 18;
  const X0 = LX + 26;
  const base = X0 + metro.lanes * LANE_W + 6;
  const avail = PW - base - 4;
  const phone = (
    <div className="lg:hidden" data-testid="metro-rows">
      {startRow('sheet')}
      <div ref={phoneRef} className="relative w-full" style={{ height: PH }}>
        <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`} className="absolute left-0 top-0" aria-hidden={selecting === null}>
          <defs>
            <pattern id="metro-hatch-m" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
              <rect width="7" height="7" fill="var(--color-surface)" />
              <rect width="1" height="7" x="6" fill="var(--color-line)" />
            </pattern>
          </defs>
          {BANDS.map(([a, b], i) => {
            const cy = (y(a) + y(b)) / 2;
            return (
              <g key={a}>
                <rect x={0} y={y(a) - SP / 2} width={PW} height={SP * (b - a + 1)} fill={i === 2 ? 'url(#metro-hatch-m)' : bandFill(i as 0 | 1 | 2)} />
                <text transform={`rotate(-90 7 ${cy})`} x={7} y={cy} textAnchor="middle" fontSize={9} fill="var(--color-fg-2)">
                  {t(BAND_KEY[i]!, lang)}
                </text>
              </g>
            );
          })}
          <line x1={LX} y1={y(1) - 20} x2={LX} y2={y(MAX_FLOOR) + 20} stroke="var(--color-line-strong)" strokeWidth={4} />
          {Array.from({ length: MAX_FLOOR }, (_, i) => i + 1).map((f) => (
            <g key={f}>
              <Station cx={LX} cy={y(f)} r={7} half={metro.overlap.has(f)} floor={f} {...stationProps(f)} />
              <text x={LX - 16} y={y(f) + 4} textAnchor="end" fontSize={12} fontFamily="var(--font-mono)" fill="var(--color-fg)" fontWeight={run && f === run.currentFloor ? 700 : undefined}>
                {f}
              </text>
            </g>
          ))}
          {metro.segments.map((segment) => {
            const xx = X0 + segment.lane * LANE_W;
            return (
              <g key={segment.key} data-testid="segment-line" data-from={segment.from} data-to={segment.to} data-lane={segment.lane}>
                {segment.fixed ? (
                  <rect x={xx - 8} y={y(segment.from) - SP / 2 + 6} width={16} height={SP - 12} rx={4} fill="var(--color-ink)" />
                ) : (
                  <>
                    <line x1={xx} y1={y(segment.from)} x2={xx} y2={y(segment.to)} stroke="var(--color-fg-2)" strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" />
                    <circle cx={xx} cy={y(segment.from)} r={4} fill="var(--color-surface)" stroke="var(--color-fg-2)" strokeWidth={2} />
                    <circle cx={xx} cy={y(segment.to)} r={4} fill="var(--color-surface)" stroke="var(--color-fg-2)" strokeWidth={2} />
                    {segment.partial ? segment.packs.map((p) => <circle key={p.packId} cx={xx} cy={y(p.floor)} r={7} fill="var(--color-ink)" data-testid="suggested" data-floor={p.floor} />) : null}
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {metro.segments.map((segment) => {
          const span = segment.to - segment.from + 1;
          const others = segment.partial
            ? metro.segments.filter((o) => o !== segment && !o.fixed && !(o.to < segment.from || o.from > segment.to)).map((o) => o.lane)
            : [];
          const cols = segment.partial ? 1 + Math.max(segment.lane, ...others) : 1;
          const cw = avail / cols - 4;
          const cl = base + (segment.lane % cols) * (avail / cols);
          const compact = span === 1;
          return (
            <div
              key={segment.key}
              className={`absolute flex flex-col gap-1 overflow-hidden rounded-md px-1.5 py-1 shadow-card ${segment.passed ? 'border border-ink bg-surface-2' : segment.fixed ? 'border border-ink bg-surface' : 'border-[1.5px] border-dashed border-fg-2 bg-surface'}`}
              style={{ left: cl, top: y(segment.from) - SP / 2 + 4, width: cw, height: SP * span - 8 }}
              data-testid="segment"
              data-from={segment.from}
              data-to={segment.to}
              data-partial={segment.partial || undefined}
              data-passed={segment.passed || undefined}
              data-lane={segment.lane}
            >
              <div className="truncate text-[10px] leading-3 text-fg-2">{segmentTitle(segment, lang)}</div>
              <div className={`flex ${compact ? 'flex-col gap-1' : 'flex-wrap items-start gap-x-2 gap-y-1'}`}>{segment.packs.map((p) => packEntry(segment, p, 'sheet', compact))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 text-xs text-fg-3" data-testid="legend">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[3px] bg-ink" />
        {t('legendFixed', lang)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-[3px] border-[1.5px] border-dashed border-fg-2" />
        {t('legendWindow', lang)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink" />
        {t('legendSuggest', lang)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-fg" style={{ background: 'linear-gradient(90deg, var(--color-fg) 50%, var(--color-surface) 50%)' }} />
        {t('legendOverlap', lang)}
      </span>
      {run ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-fg" />
            {t('legendPassed', lang)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-[1.5px] border-fg p-px">
              <span className="block h-full w-full rounded-full border border-fg" />
            </span>
            {t('legendCurrent', lang)}
          </span>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="rounded-md border border-line bg-surface shadow-card">
      {selectBanner}
      {desktop}
      {phone}
      {legend}
    </div>
  );
}
