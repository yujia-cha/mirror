/**
 * The route as a timetable: floors are columns (rows on a phone), required packs are blocks.
 * A pack pinned to one floor is a solid ink block; a pack that may sit on any of several floors
 * is a dashed block spanning them, with the planner's suggested floor drawn darker. Floors past
 * the plan collapse into one narrow column, and runs of free floors into one cell. Hovering or
 * focusing a block widens its floors so nothing inside it is cut off.
 */
import { useState, type ReactNode } from 'react';
import { Eye, Star } from 'lucide-react';
import type { FloorPlan, GameIndexes, ObservedGift, RoutePlan } from '../../core/types.ts';
import { t, type Lang } from '../i18n.ts';
import { bandOf } from '../lib/labels.ts';
import type { Judgement } from '../lib/judgement.ts';
import { MAX_FLOOR, freeRuns, laneBlocks, timetableRows, type Block } from '../lib/timetable.ts';
import { GiftIcon } from './GiftIcon.tsx';
import { PackImage } from './PackImage.tsx';

export interface TimetableProps {
  plan: RoutePlan;
  lastFloor: number;
  hard: boolean;
  indexes: GameIndexes;
  /** Condition judgement per wanted gift, for the icon borders. */
  judgements: Map<number, Judgement | null>;
  /** Hover text for a gift tile (its condition sentence), if any. */
  giftTitle: (id: number) => string | undefined;
  packName: (id: number) => string;
  keywordLabel: (id: NonNullable<RoutePlan['start']['keyword']>) => string;
  /** Pin or unpin an observation; absent when the timetable is read-only. */
  onToggleObserved?: (giftId: number) => void;
  lang: Lang;
}

function bandClass(band: 0 | 1 | 2): string {
  if (band === 2) return 'bg-hatch';
  if (band === 1) return 'bg-surface-2';
  return '';
}

function Pickups({
  pickups,
  indexes,
  judgements,
  giftTitle,
  lang,
}: {
  pickups: FloorPlan['pickups'];
  indexes: GameIndexes;
  judgements: Map<number, Judgement | null>;
  giftTitle: (id: number) => string | undefined;
  lang: Lang;
}) {
  // Only what the pack guarantees is worth showing; a general drop can come from anywhere.
  const sure = pickups.filter((p) => p.kind === 'exclusive');
  if (sure.length === 0) return null;
  return (
    <ul className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(52px,1fr))] justify-items-center">
      {sure.map((p) => {
        const gift = indexes.giftById.get(p.giftId);
        if (!gift) return null;
        return (
          <li key={p.giftId} className="flex min-w-0 justify-center">
            <GiftIcon gift={gift} size={44} name judgement={judgements.get(p.giftId) ?? null} title={giftTitle(p.giftId)} lang={lang} />
          </li>
        );
      })}
    </ul>
  );
}

function BlockBody({
  block,
  indexes,
  judgements,
  giftTitle,
  packName,
  lang,
  orientation,
}: {
  block: Block;
  indexes: GameIndexes;
  judgements: Map<number, Judgement | null>;
  giftTitle: (id: number) => string | undefined;
  packName: (id: number) => string;
  lang: Lang;
  orientation: 'columns' | 'rows';
}) {
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
        orientation === 'columns'
          ? { left: `${pickStart}%`, width: `${pickSize}%`, top: 0, bottom: 0, borderBottom: '3px solid var(--color-fg)' }
          : { top: `${pickStart}%`, height: `${pickSize}%`, left: 0, right: 0, borderLeft: '3px solid var(--color-fg)' }
      }
    />
  );
  const pack = indexes.packById.get(floor.packId!);
  return (
    <div
      className={`relative m-1.5 min-w-0 rounded-sm ${
        fixed ? 'border border-ink bg-ink text-ink-fg' : 'border-[1.5px] border-dashed border-fg-2 bg-surface text-fg'
      }`}
      data-testid={fixed ? 'block-fixed' : 'block-window'}
    >
      {marker}
      <div className="relative flex min-w-0 flex-col gap-1.5 px-2 py-1.5">
        <div className="flex min-w-0 items-start gap-1.5">
          {pack ? <PackImage pack={pack} size={28} lang={lang} /> : null}
          <span className="line-clamp-2 min-w-0 text-sm font-medium leading-tight">{packName(floor.packId!)}</span>
        </div>
        <div className="text-xs opacity-80">{fixed ? t('routeFixed', lang) : t('routeWindow', lang, { from, to, pick: floor.floor })}</div>
        <div className={fixed ? 'rounded-sm bg-surface p-1 text-fg' : ''}>
          <Pickups pickups={floor.pickups} indexes={indexes} judgements={judgements} giftTitle={giftTitle} lang={lang} />
        </div>
      </div>
    </div>
  );
}

function ObservedTile({
  entry,
  indexes,
  judgements,
  packName,
  onToggle,
  lang,
}: {
  entry: ObservedGift;
  indexes: GameIndexes;
  judgements: Map<number, Judgement | null>;
  packName: (id: number) => string;
  onToggle?: (giftId: number) => void;
  lang: Lang;
}) {
  const gift = indexes.giftById.get(entry.giftId);
  if (!gift) return null;
  const why = entry.pinned
    ? t('routeObservedPinned', lang)
    : entry.freedPack !== null
      ? t('routeObservedFrees', lang, { pack: packName(entry.freedPack) })
      : t('routeObservedRescue', lang);
  const label = entry.pinned ? t('routeObservedPinned', lang) : t('routeObservedRecommended', lang);
  const body = (
    <>
      <span className="relative">
        <GiftIcon gift={gift} size={32} judgement={judgements.get(entry.giftId) ?? null} lang={lang} />
        <span className={`absolute -right-1 -top-1 rounded-full border border-line p-0.5 ${entry.pinned ? 'bg-ink text-ink-fg' : 'bg-surface text-fg-2'}`} aria-hidden>
          <Eye size={9} />
        </span>
      </span>
      <span className="line-clamp-2 w-full break-keep text-center text-[10px] leading-tight text-fg" aria-hidden>
        {gift.name[lang] || gift.name.ko}
      </span>
      <span className={`rounded-full px-1 text-[9px] leading-[13px] ${entry.pinned ? 'bg-ink text-ink-fg' : 'border border-line text-fg-2'}`}>{label}</span>
    </>
  );
  const title = `${t('routeObserved', lang)} · ${why}`;
  return onToggle ? (
    <button
      type="button"
      onClick={() => onToggle(entry.giftId)}
      aria-pressed={entry.pinned}
      aria-label={`${t('routeObservedToggle', lang, { name: gift.name[lang] || gift.name.ko })}`}
      title={title}
      data-testid="observed-tile"
      className="flex w-full flex-col items-center gap-0.5 rounded-sm px-0.5 hover:bg-surface-2"
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

export function Timetable({ plan, lastFloor, hard, indexes, judgements, giftTitle, packName, keywordLabel, onToggleObserved, lang }: TimetableProps) {
  const blocks = laneBlocks(plan.floors);
  const lanes = Math.max(1, ...blocks.map((b) => b.lane + 1));
  const runs = freeRuns(plan.floors, blocks);
  const [focus, setFocus] = useState<{ from: number; to: number } | null>(null);

  const startGift = plan.start.startGift ? indexes.giftById.get(plan.start.startGift) : undefined;
  const startKeyword = plan.start.keyword ? keywordLabel(plan.start.keyword) : null;
  const observedTiles = plan.start.observed.map((entry) => (
    <ObservedTile key={entry.giftId} entry={entry} indexes={indexes} judgements={judgements} packName={packName} onToggle={onToggleObserved} lang={lang} />
  ));
  const startCell =
    startGift || startKeyword || observedTiles.length > 0 ? (
      <>
        {startGift ? (
          <span className="flex flex-col items-center gap-0.5" title={t('routeStartGift', lang)}>
            <GiftIcon gift={startGift} size={32} judgement={judgements.get(startGift.id) ?? null} lang={lang} />
            <span className="line-clamp-2 break-keep text-center text-[10px] leading-tight text-fg">{startGift.name[lang] || startGift.name.ko}</span>
          </span>
        ) : startKeyword ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-fg" title={t('optionStartKeyword', lang)}>
            <Star size={11} aria-hidden className="flex-none text-fg-3" />
            <span className="truncate">{startKeyword}</span>
          </span>
        ) : null}
        {observedTiles}
      </>
    ) : null;
  const freeLabel = (run: { from: number; to: number }): string =>
    run.from === run.to ? t('routeFree', lang) : t('routeFreeRange', lang, { from: run.from, to: run.to });
  const laneRows = `repeat(${lanes}, minmax(96px, auto))`;
  const outCount = MAX_FLOOR - lastFloor;

  const bandLabels: [number, number, string][] = [
    [1, 5, t(hard ? 'optionBandHard' : 'optionBandNormal', lang)],
    [6, 10, t('optionBandParallel', lang)],
    [11, 15, t('optionBandExtreme', lang)],
  ];

  // ---- desktop: columns are floors; the focused block's floors grow so its text fits ----
  const floorTracks = Array.from({ length: lastFloor }, (_, i) => {
    const floor = i + 1;
    const grown = focus !== null && floor >= focus.from && floor <= focus.to;
    return grown ? 'minmax(0, 2.2fr)' : 'minmax(0, 1fr)';
  });
  const columns = ['84px', ...floorTracks, outCount > 0 ? '44px' : ''].filter(Boolean).join(' ');
  const outColumn = lastFloor + 2;
  const focusHandlers = (block: Block) => ({
    onPointerEnter: () => setFocus({ from: block.from, to: block.to }),
    onPointerLeave: () => setFocus(null),
    onFocus: () => setFocus({ from: block.from, to: block.to }),
    onBlur: () => setFocus(null),
  });
  const desktop = (
    <div className="hidden lg:block" data-testid="timetable-columns">
      <div className="grid-animate grid border-b border-line" style={{ gridTemplateColumns: columns }}>
        <div className="h-6 border-r border-line" />
        {bandLabels
          .filter(([a]) => a <= lastFloor)
          .map(([a, b, label], i) => (
            <div
              key={label}
              style={{ gridColumn: `${a + 1} / span ${Math.min(b, lastFloor) - a + 1}` }}
              className={`flex h-6 items-center justify-center overflow-hidden whitespace-nowrap border-r border-line px-1 text-xs text-fg-2 ${bandClass(i as 0 | 1 | 2)}`}
            >
              {label}
            </div>
          ))}
        {outCount > 0 ? <div className="h-6 bg-hatch" style={{ gridColumn: outColumn }} /> : null}
      </div>
      <div className="grid-animate grid border-b border-line-strong" style={{ gridTemplateColumns: columns }}>
        <div className="flex h-9 items-center justify-center border-r border-line font-mono text-xs">{t('routeStart', lang)}</div>
        {Array.from({ length: lastFloor }, (_, i) => i + 1).map((f) => (
          <div key={f} className={`flex h-9 items-center justify-center border-r border-line font-mono text-xs text-fg ${bandClass(bandOf(f))}`}>
            {f}
          </div>
        ))}
        {outCount > 0 ? (
          <div className="flex h-9 items-center justify-center bg-hatch font-mono text-xs text-fg-3" style={{ gridColumn: outColumn }}>
            {lastFloor + 1}~
          </div>
        ) : null}
      </div>
      <div className="grid-animate relative grid" style={{ gridTemplateColumns: columns, gridTemplateRows: laneRows }}>
        <div aria-hidden className="grid-animate pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: columns }}>
          <div className="border-r border-line" />
          {Array.from({ length: lastFloor }, (_, i) => (
            <div key={i} className={`border-r border-line ${bandClass(bandOf(i + 1))}`} />
          ))}
          {outCount > 0 ? <div className="bg-hatch" /> : null}
        </div>
        {startCell ? (
          <div className="relative m-1.5 flex min-w-0 flex-col items-center gap-2 rounded-sm border border-line-strong bg-surface px-1 py-1.5" style={{ gridColumn: 1, gridRow: `1 / span ${lanes}` }} data-testid="start-cell">
            {startCell}
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
        {blocks.map((block) => (
          <div
            key={block.floor.floor}
            className="relative flex min-w-0 flex-col outline-none"
            style={{ gridColumn: `${block.from + 1} / span ${block.to - block.from + 1}`, gridRow: block.lane + 1 }}
            tabIndex={0}
            {...focusHandlers(block)}
          >
            <BlockBody block={block} indexes={indexes} judgements={judgements} giftTitle={giftTitle} packName={packName} lang={lang} orientation="columns" />
          </div>
        ))}
        {outCount > 0 ? (
          <div
            className="relative flex items-center justify-center px-1 text-center text-xs leading-tight text-fg-3"
            style={{ gridColumn: outColumn, gridRow: `1 / span ${lanes}` }}
            title={`${lastFloor + 1}~${MAX_FLOOR}`}
          >
            {t('routeOutOfRange', lang)}
          </div>
        ) : null}
      </div>
    </div>
  );

  // ---- mobile: rows are floors and grow with their content; free runs are one short row ----
  const { rows, rowOf } = timetableRows(plan.floors, blocks);
  const rowTemplate = rows.map((row) => (row.kind === 'free' ? '40px' : 'minmax(58px, auto)')).join(' ');
  const mobileColumns = `56px repeat(${lanes}, minmax(0, 1fr))`;
  const rowBand = (row: (typeof rows)[number]): string =>
    row.kind === 'floor' ? bandClass(bandOf(row.floor)) : row.kind === 'free' ? bandClass(bandOf(row.from)) : '';
  const mobile = (
    <div className="lg:hidden" data-testid="timetable-rows">
      <div className="relative grid" style={{ gridTemplateRows: rowTemplate, gridTemplateColumns: mobileColumns }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateRows: rowTemplate }}>
          {rows.map((row, i) => (
            <div key={i} className={`flex items-center border-b border-line pl-2 font-mono text-xs ${row.kind === 'start' ? 'text-fg-2' : 'text-fg'} ${rowBand(row)}`}>
              {row.kind === 'start' ? t('routeStart', lang) : row.kind === 'floor' ? row.floor : `${row.from}~${row.to}`}
            </div>
          ))}
        </div>
        {startCell ? (
          <div className="relative m-1.5 flex min-w-0 flex-wrap items-start gap-2 rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-xs text-fg" style={{ gridRow: 1, gridColumn: `2 / span ${lanes}` }}>
            {startCell}
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
          const top = rowOf.get(block.from) ?? 1;
          const bottom = rowOf.get(block.to) ?? top;
          return (
            <div key={block.floor.floor} className="relative flex min-w-0 flex-col" style={{ gridRow: `${top} / span ${bottom - top + 1}`, gridColumn: block.lane + 2 }}>
              <BlockBody block={block} indexes={indexes} judgements={judgements} giftTitle={giftTitle} packName={packName} lang={lang} orientation="rows" />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-card">
      {desktop}
      {mobile}
      <Legend lang={lang} />
    </div>
  );
}
