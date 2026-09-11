/**
 * The route as a timetable: floors are columns (rows on a phone), required packs are blocks.
 * Cells are fixed size so a block's length is its floor span and nothing else: a pack pinned to
 * one floor is a solid ink block, a pack that may sit on any of several floors is a dashed block
 * spanning them with the planner's suggested floor drawn darker. What does not fit in a cell is
 * cut off and shown in a popover (desktop hover or focus) or a bottom sheet (phone tap); the grid
 * itself never moves.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, Star } from 'lucide-react';
import type { GameIndexes, ObservedGift, RoutePlan } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { bandOf } from '../lib/labels.ts';
import type { Judgement } from '../lib/judgement.ts';
import { FREE_ROW_PX, LANE_PX, MAX_FLOOR, ROW_PX, compactLanes, freeRuns, iconCap, laneBlocks, timetableRows, type Block } from '../lib/timetable.ts';
import { useDismiss } from '../lib/useDismiss.ts';
import { BlockDetailBody, DetailSurface, ObservedDetailBody, type DetailContext, type DetailMode } from './BlockDetail.tsx';
import { GiftIcon } from './GiftIcon.tsx';
import { PackImage } from './PackImage.tsx';

export interface TimetableProps {
  plan: RoutePlan;
  indexes: GameIndexes;
  /** Condition judgement per wanted gift, for the icon borders. */
  judgements: Map<number, Judgement | null>;
  /** Hover text for a gift tile (its condition sentence), if any. */
  giftTitle: (id: number) => string | undefined;
  packName: (id: number) => string;
  keywordLabel: (id: NonNullable<RoutePlan['start']['keyword']>) => string;
  /** Gifts the user marked 반드시. */
  isMust?: (id: number) => boolean;
  /** Whether a gift is in the season's observation pool. */
  observable?: (id: number) => boolean;
  /** Pin or unpin an observation; absent when the timetable is read-only. */
  onToggleObserved?: (giftId: number) => void;
  lang: Lang;
}

type Layout = 'columns' | 'rows' | 'compact';

interface Detail {
  key: string;
  mode: DetailMode;
}

type Placement = { vertical: 'below' | 'above'; horizontal: 'start' | 'end' };

const HOVER_DELAY_MS = 150;
/** Room a popover needs below a block before it flips above. */
const POPOVER_PX = 360;
const POPOVER_WIDTH_PX = 300;

function bandClass(band: 0 | 1 | 2): string {
  if (band === 2) return 'bg-hatch';
  if (band === 1) return 'bg-surface-2';
  return '';
}

function BlockBody({ block, layout, ctx }: { block: Block; layout: Layout; ctx: DetailContext }) {
  const { floor, from, to } = block;
  const fixed = from === to;
  const span = to - from + 1;
  const pickStart = ((floor.floor - from) / span) * 100;
  const pickSize = 100 / span;
  const marker = fixed ? null : (
    <span
      aria-hidden
      className="pointer-events-none absolute bg-surface-2"
      style={
        layout === 'columns'
          ? { left: `${pickStart}%`, width: `${pickSize}%`, top: 0, bottom: 0, borderBottom: '3px solid var(--color-fg)' }
          : { top: `${pickStart}%`, height: `${pickSize}%`, left: 0, right: 0, borderLeft: '3px solid var(--color-fg)' }
      }
    />
  );
  const pack = ctx.indexes.packById.get(floor.packId!);
  const compact = layout === 'compact';
  const where = fixed
    ? t('routeFixed', ctx.lang)
    : compact
      ? t('routePick', ctx.lang, { pick: floor.floor })
      : t('routeWindowCompact', ctx.lang, { from, to, pick: floor.floor });
  // Only what the pack guarantees is worth showing; a general drop can come from anywhere.
  const pickups = floor.pickups.filter((p) => p.kind === 'exclusive');
  const cap = iconCap(span, layout);
  const shownPickups = pickups.length > cap ? pickups.slice(0, cap - 1) : pickups;
  const more = pickups.length - shownPickups.length;
  const icons = (
    <ul className={`flex min-w-0 flex-wrap gap-1 ${layout === 'rows' ? 'justify-end' : ''}`}>
      {shownPickups.map((p) => {
        const gift = ctx.indexes.giftById.get(p.giftId);
        return gift ? (
          <li key={p.giftId} className="flex">
            <GiftIcon gift={gift} size={32} judgement={ctx.judgements.get(p.giftId) ?? null} must={ctx.isMust(p.giftId)} title={ctx.giftTitle(p.giftId)} lang={ctx.lang} />
          </li>
        ) : null;
      })}
      {more > 0 ? (
        <li className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-surface font-mono text-[11px] text-fg" data-testid="block-more">
          {t('routeMore', ctx.lang, { n: more })}
        </li>
      ) : null}
    </ul>
  );
  return (
    <div
      className={`relative m-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm ${
        fixed ? 'border border-ink bg-ink text-ink-fg' : 'border-[1.5px] border-dashed border-fg-2 bg-surface text-fg'
      }`}
      data-testid={fixed ? 'block-fixed' : 'block-window'}
    >
      {marker}
      {layout === 'columns' ? (
        <div className="relative flex min-w-0 flex-col gap-1 px-1.5 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {pack ? <PackImage pack={pack} size={24} lang={ctx.lang} /> : null}
            <span className="truncate text-xs font-medium">{ctx.packName(floor.packId!)}</span>
          </div>
          <div className="truncate text-[10px] leading-3 opacity-80">{where}</div>
          <div className={fixed ? 'rounded-sm bg-surface p-0.5 text-fg' : ''}>{icons}</div>
        </div>
      ) : (
        <div className={`relative flex min-w-0 gap-1 px-1 py-1 ${compact ? 'flex-col items-center' : 'items-start gap-1.5 px-1.5'}`}>
          {pack ? <PackImage pack={pack} size={compact ? 24 : 32} lang={ctx.lang} /> : null}
          {compact ? null : (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{ctx.packName(floor.packId!)}</span>
              <span className="truncate text-[10px] leading-3 opacity-80">{where}</span>
            </div>
          )}
          <div className={`min-w-0 ${fixed ? 'rounded-sm bg-surface p-0.5 text-fg' : ''}`}>{icons}</div>
        </div>
      )}
    </div>
  );
}

function ObservedTile({
  entry,
  ctx,
  onPress,
}: {
  entry: ObservedGift;
  ctx: DetailContext;
  /** What a press does: toggle the pin (desktop) or open the sheet (phone). */
  onPress?: () => void;
}) {
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
      <span className={`rounded-full px-1 text-[9px] leading-[13px] ${entry.pinned ? 'bg-ink text-ink-fg' : 'border border-line text-fg-2'}`}>{label}</span>
    </>
  );
  const title = `${name} · ${t('routeObserved', ctx.lang)} · ${why}`;
  return onPress ? (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={entry.pinned}
      aria-label={t('routeObservedToggle', ctx.lang, { name })}
      title={title}
      data-testid="observed-tile"
      className="flex flex-col items-center gap-0.5 rounded-sm px-0.5 hover:bg-surface-2"
    >
      {body}
    </button>
  ) : (
    <span className="flex flex-col items-center gap-0.5" title={title} data-testid="observed-tile">
      {body}
    </span>
  );
}

function Legend({ lang }: { lang: Lang }) {
  const item = (icon: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 text-xs text-fg-3" data-testid="legend">
      {item(<span className="h-2.5 w-3.5 rounded-[3px] bg-ink" />, t('legendFixed', lang))}
      {item(<span className="h-2.5 w-5 rounded-[3px] border-[1.5px] border-dashed border-fg-2" />, t('legendWindow', lang))}
    </div>
  );
}

export function Timetable({ plan, indexes, judgements, giftTitle, packName, keywordLabel, isMust, observable, onToggleObserved, lang }: TimetableProps) {
  const blocks = laneBlocks(plan.floors);
  const lanes = Math.max(1, ...blocks.map((b) => b.lane + 1));
  const runs = freeRuns(plan.floors, blocks);
  const ctx: DetailContext = {
    indexes,
    judgements,
    giftTitle,
    packName,
    isMust: isMust ?? (() => false),
    observable: observable ?? (() => false),
    observed: new Set(plan.start.observed.filter((o) => o.pinned).map((o) => o.giftId)),
    onToggleObserved,
    lang,
  };

  // ---- one open detail at a time; the desktop popover opens on hover after a short delay ----
  const [detail, setDetail] = useState<Detail | null>(null);
  const [placement, setPlacement] = useState<Placement>({ vertical: 'below', horizontal: 'start' });
  const timer = useRef<number | null>(null);
  const clearTimer = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  const close = useCallback(() => setDetail(null), []);
  const openPopover = (key: string, anchor: HTMLElement | null): void => {
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      setPlacement({
        vertical: rect.bottom + POPOVER_PX > window.innerHeight && rect.top > POPOVER_PX ? 'above' : 'below',
        horizontal: rect.left + POPOVER_WIDTH_PX > window.innerWidth - 8 ? 'end' : 'start',
      });
    }
    setDetail({ key, mode: 'popover' });
  };
  const hoverHandlers = (key: string) => ({
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      const anchor = event.currentTarget;
      clearTimer();
      timer.current = window.setTimeout(() => openPopover(key, anchor), HOVER_DELAY_MS);
    },
    onPointerLeave: () => {
      clearTimer();
      timer.current = window.setTimeout(() => setDetail((d) => (d?.mode === 'popover' ? null : d)), HOVER_DELAY_MS);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      clearTimer();
      openPopover(key, event.currentTarget);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
    },
  });
  const openRef = useRef<HTMLDivElement | null>(null);
  useDismiss(openRef, close, detail?.mode === 'popover');
  const blockKey = (block: Block): string => `block-${block.floor.floor}`;
  const observedKey = (entry: ObservedGift): string => `observed-${entry.giftId}`;
  const blockLabel = (block: Block): string => {
    const count = block.floor.pickups.filter((p) => p.kind === 'exclusive').length;
    const where = block.from === block.to ? t('routeFixedFloor', lang, { floor: block.from }) : t('routeWindowShort', lang, { from: block.from, to: block.to });
    return `${packName(block.floor.packId!)} · ${where} · ${t('routeGiftCount', lang, { n: count })} · ${t('routeDetail', lang)}`;
  };
  const detailFor = (key: string, mode: DetailMode): ReactNode => {
    if (detail?.key !== key || detail.mode !== mode) return null;
    const block = blocks.find((b) => blockKey(b) === key);
    const entry = plan.start.observed.find((o) => observedKey(o) === key);
    const label = block ? packName(block.floor.packId!) : entry ? pick(indexes.giftById.get(entry.giftId)?.name, lang) : '';
    return (
      <DetailSurface mode={mode} label={label} closeLabel={t('routeClose', lang)} onClose={close} placement={placement}>
        {block ? <BlockDetailBody block={block} ctx={ctx} /> : entry ? <ObservedDetailBody entry={entry} ctx={ctx} /> : null}
      </DetailSurface>
    );
  };

  const startGift = plan.start.startGift ? indexes.giftById.get(plan.start.startGift) : undefined;
  const startKeyword = plan.start.keyword ? keywordLabel(plan.start.keyword) : null;
  const startHead = startGift ? (
    <span className="flex flex-col items-center gap-0.5" title={`${t('routeStartGift', lang)} · ${pick(startGift.name, lang)}`}>
      <GiftIcon gift={startGift} size={32} judgement={judgements.get(startGift.id) ?? null} must={ctx.isMust(startGift.id)} lang={lang} />
    </span>
  ) : startKeyword ? (
    <span className="flex min-w-0 max-w-full items-center gap-1 text-xs text-fg" title={t('optionStartKeyword', lang)}>
      <Star size={11} aria-hidden className="flex-none text-fg-3" />
      <span className="truncate">{startKeyword}</span>
    </span>
  ) : null;
  const hasStart = startHead !== null || plan.start.observed.length > 0;
  const startCell = (mode: DetailMode): ReactNode => (
    <>
      {startHead}
      {plan.start.observed.map((entry) => (
        <span key={entry.giftId} className="relative flex">
          <ObservedTile
            entry={entry}
            ctx={ctx}
            onPress={
              mode === 'sheet'
                ? () => setDetail({ key: observedKey(entry), mode })
                : onToggleObserved
                  ? () => onToggleObserved(entry.giftId)
                  : undefined
            }
          />
          {mode === 'sheet' ? detailFor(observedKey(entry), mode) : null}
        </span>
      ))}
    </>
  );
  const freeLabel = (run: { from: number; to: number }): string =>
    run.from === run.to ? t('routeFree', lang) : t('routeFreeRange', lang, { from: run.from, to: run.to });

  const bandLabels: [number, number, string][] = [
    [1, 5, t('optionBandHard', lang)],
    [6, 10, t('optionBandParallel', lang)],
    [11, 15, t('optionBandExtreme', lang)],
  ];
  const floors = Array.from({ length: MAX_FLOOR }, (_, i) => i + 1);

  // ---- desktop: columns are floors, lanes are fixed-height rows ----
  const columns = `84px repeat(${MAX_FLOOR}, minmax(0, 1fr))`;
  const laneRows = `repeat(${lanes}, ${LANE_PX}px)`;
  const desktop = (
    <div className="hidden lg:block" data-testid="timetable-columns">
      <div className="grid overflow-hidden rounded-t-md border-b border-line" style={{ gridTemplateColumns: columns }}>
        <div className="h-6 border-r border-line" />
        {bandLabels.map(([a, b, label], i) => (
          <div
            key={label}
            style={{ gridColumn: `${a + 1} / span ${b - a + 1}` }}
            className={`flex h-6 items-center justify-center overflow-hidden whitespace-nowrap border-r border-line px-1 text-xs text-fg-2 ${bandClass(i as 0 | 1 | 2)}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid border-b border-line-strong" style={{ gridTemplateColumns: columns }}>
        <div className="flex h-9 items-center justify-center border-r border-line font-mono text-xs">{t('routeStart', lang)}</div>
        {floors.map((f) => (
          <div key={f} className={`flex h-9 items-center justify-center border-r border-line font-mono text-xs text-fg ${bandClass(bandOf(f))}`}>
            {f}
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: columns, gridTemplateRows: laneRows }}>
        <div aria-hidden className="border-r border-line" style={{ gridColumn: 1, gridRow: `1 / span ${lanes}` }} />
        {floors.map((f) => (
          <div key={f} aria-hidden className={`border-r border-line ${bandClass(bandOf(f))}`} style={{ gridColumn: f + 1, gridRow: `1 / span ${lanes}` }} />
        ))}
        {hasStart ? (
          <div
            className="relative m-1 flex min-w-0 flex-wrap content-start items-start justify-center gap-1 overflow-hidden rounded-sm border border-line-strong bg-surface px-0.5 py-1"
            style={{ gridColumn: 1, gridRow: `1 / span ${lanes}` }}
            data-testid="start-cell"
          >
            {startCell('popover')}
          </div>
        ) : null}
        {runs.map((run) => (
          <div
            key={run.from}
            className="relative flex items-center justify-center text-xs text-fg-3"
            style={{ gridColumn: `${run.from + 1} / span ${run.to - run.from + 1}`, gridRow: 1 }}
          >
            {freeLabel(run)}
          </div>
        ))}
        {blocks.map((block) => {
          const key = blockKey(block);
          const open = detail?.key === key && detail.mode === 'popover';
          return (
            <div
              key={key}
              ref={open ? openRef : undefined}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={blockLabel(block)}
              className="relative flex min-w-0 flex-col outline-none focus-visible:outline"
              style={{ gridColumn: `${block.from + 1} / span ${block.to - block.from + 1}`, gridRow: block.lane + 1 }}
              data-testid="block"
              {...hoverHandlers(key)}
            >
              <BlockBody block={block} layout="columns" ctx={ctx} />
              {detailFor(key, 'popover')}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- phone: rows are floors at a fixed height; free runs fold into one short row ----
  const { rows, rowOf } = timetableRows(plan.floors, blocks);
  const rowTemplate = rows.map((row) => (row.kind === 'start' ? 'auto' : row.kind === 'free' ? `${FREE_ROW_PX}px` : `${ROW_PX}px`)).join(' ');
  const mobileColumns = `56px repeat(${lanes}, minmax(0, 1fr))`;
  const rowLayout: Layout = compactLanes(lanes) ? 'compact' : 'rows';
  const rowBand = (row: (typeof rows)[number]): string =>
    row.kind === 'floor' ? bandClass(bandOf(row.floor)) : row.kind === 'free' ? bandClass(bandOf(row.from)) : '';
  const mobile = (
    <div className="lg:hidden" data-testid="timetable-rows">
      <div className="grid" style={{ gridTemplateRows: rowTemplate, gridTemplateColumns: mobileColumns }}>
        {rows.map((row, i) => (
          <div
            key={`label-${i}`}
            className={`flex items-center border-b border-line pl-2 font-mono text-xs ${row.kind === 'start' ? 'text-fg-2' : 'text-fg'} ${rowBand(row)}`}
            style={{ gridColumn: 1, gridRow: i + 1 }}
            data-testid="row-label"
          >
            {row.kind === 'start' ? t('routeStart', lang) : row.kind === 'floor' ? row.floor : `${row.from}~${row.to}`}
          </div>
        ))}
        {rows.map((row, i) => (
          <div key={`band-${i}`} aria-hidden className={`border-b border-line ${rowBand(row)}`} style={{ gridColumn: `2 / span ${lanes}`, gridRow: i + 1 }} />
        ))}
        {hasStart ? (
          <div className="relative m-1 flex min-w-0 flex-wrap items-start gap-1.5 rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-xs text-fg" style={{ gridRow: 1, gridColumn: `2 / span ${lanes}` }} data-testid="start-cell">
            {startCell('sheet')}
          </div>
        ) : null}
        {rows.map((row, i) =>
          row.kind === 'free' ? (
            <div key={`free-${row.from}`} className="relative flex items-center pl-2 text-xs text-fg-3" style={{ gridRow: i + 1, gridColumn: `2 / span ${lanes}` }}>
              {t('routeFree', lang)}
            </div>
          ) : null,
        )}
        {blocks.map((block) => {
          const key = blockKey(block);
          const top = rowOf.get(block.from) ?? 1;
          const bottom = rowOf.get(block.to) ?? top;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-expanded={detail?.key === key && detail.mode === 'sheet'}
              aria-label={blockLabel(block)}
              onClick={() => setDetail({ key, mode: 'sheet' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setDetail({ key, mode: 'sheet' });
                }
              }}
              className="relative flex min-w-0 flex-col outline-none focus-visible:outline"
              style={{ gridRow: `${top} / span ${bottom - top + 1}`, gridColumn: block.lane + 2 }}
              data-testid="block"
            >
              <BlockBody block={block} layout={rowLayout} ctx={ctx} />
              {detailFor(key, 'sheet')}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rounded-md border border-line bg-surface shadow-card">
      {desktop}
      {mobile}
      <Legend lang={lang} />
    </div>
  );
}
