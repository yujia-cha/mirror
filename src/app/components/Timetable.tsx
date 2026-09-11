/**
 * The route as a timetable: floors are columns (rows on a phone), required packs are blocks.
 * A pack pinned to one floor is a solid ink block; a pack that may sit on any of several floors
 * is a dashed block spanning them, with the planner's suggested floor drawn darker. Floors past
 * the plan collapse into one narrow column, and runs of free floors into one cell.
 */
import type { ReactNode } from 'react';
import { Check, Eye, EyeOff, Star, Store, Waves } from 'lucide-react';
import type { FloorPlan, RoutePlan } from '../../core/types.ts';
import { t, type Lang } from '../i18n.ts';
import { bandOf } from '../lib/labels.ts';
import { MAX_FLOOR, freeRuns, laneBlocks, timetableRows, type Block } from '../lib/timetable.ts';

function bandClass(band: 0 | 1 | 2): string {
  if (band === 2) return 'bg-hatch';
  if (band === 1) return 'bg-surface-2';
  return '';
}

function Pickups({
  pickups,
  giftName,
  lang,
  onInk,
}: {
  pickups: FloorPlan['pickups'];
  giftName: (id: number) => string;
  lang: Lang;
  onInk: boolean;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {pickups.map((p) => (
        <li key={p.giftId} className="flex min-w-0 items-center gap-1 text-xs">
          {p.kind === 'exclusive' ? (
            <Check size={11} aria-label={t('acqSure', lang)} className="flex-none" />
          ) : (
            <Waves size={11} aria-label={t('acqMaybe', lang)} className="flex-none" />
          )}
          <span className={`truncate ${onInk ? '' : 'text-fg'}`}>{giftName(p.giftId)}</span>
        </li>
      ))}
    </ul>
  );
}

function BlockBody({
  block,
  packName,
  giftName,
  lang,
  orientation,
}: {
  block: Block;
  packName: (id: number) => string;
  giftName: (id: number) => string;
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
  const obs = floor.observation.needed ? (
    floor.observation.possible ? (
      <span className="inline-flex flex-none items-center gap-0.5 text-xs opacity-85" title={t('legendEye', lang)}>
        <Eye size={11} aria-hidden />
        {floor.observation.starlight}
      </span>
    ) : (
      <span className="inline-flex flex-none items-center gap-0.5 text-xs" title={t('routeObservationImpossible', lang)}>
        <EyeOff size={11} aria-hidden />
      </span>
    )
  ) : null;
  return (
    <div
      className={`relative m-1.5 min-w-0 overflow-hidden rounded-sm ${
        fixed ? 'border border-ink bg-ink text-ink-fg' : 'border-[1.5px] border-dashed border-fg-2 bg-surface text-fg'
      }`}
      data-testid={fixed ? 'block-fixed' : 'block-window'}
    >
      {marker}
      <div className="relative flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="truncate text-sm font-medium">{packName(floor.packId!)}</span>
          {obs}
        </div>
        <div className="truncate text-xs opacity-80">
          {fixed ? t('routeFixed', lang) : t('routeWindow', lang, { from, to, pick: floor.floor })}
        </div>
        <Pickups pickups={floor.pickups} giftName={giftName} lang={lang} onInk={fixed} />
      </div>
    </div>
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
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 text-xs text-fg-3">
      {item(<span className="h-2.5 w-3.5 rounded-[3px] bg-ink" />, t('legendFixed', lang))}
      {item(<span className="h-2.5 w-5 rounded-[3px] border-[1.5px] border-dashed border-fg-2" />, t('legendWindow', lang))}
      {item(<Check size={11} aria-hidden />, t('legendSure', lang))}
      {item(<Waves size={11} aria-hidden />, t('legendMaybe', lang))}
      {item(<Eye size={11} aria-hidden />, t('legendEye', lang))}
      {item(<Store size={11} aria-hidden />, t('routeFuse', lang))}
      {item(<span className="h-2.5 w-3.5 rounded-[3px] border border-line bg-hatch" />, t('legendHatch', lang))}
    </div>
  );
}

export function Timetable({
  plan,
  lastFloor,
  hard,
  packName,
  giftName,
  keywordLabel,
  lang,
}: {
  plan: RoutePlan;
  lastFloor: number;
  hard: boolean;
  packName: (id: number) => string;
  giftName: (id: number) => string;
  keywordLabel: (id: NonNullable<RoutePlan['start']['keyword']>) => string;
  lang: Lang;
}) {
  const blocks = laneBlocks(plan.floors);
  const lanes = Math.max(1, ...blocks.map((b) => b.lane + 1));
  const runs = freeRuns(plan.floors, blocks);
  const fusionFloor = plan.fusions.filter((f) => !f.unreachable).map((f) => f.earliestFloor);
  const fuseFrom = fusionFloor.length > 0 ? Math.max(1, Math.min(...fusionFloor)) : null;
  const fuseLabel =
    fuseFrom !== null
      ? `${t('routeFuse', lang)} → ${plan.fusions.filter((f) => !f.unreachable).map((f) => giftName(f.result)).join(', ')}`
      : null;
  const startGift = plan.start.startGift ? giftName(plan.start.startGift) : null;
  const startKeyword = plan.start.keyword ? keywordLabel(plan.start.keyword) : null;
  const startCell = startGift ? (
    <>
      <span className="flex items-center gap-1 text-xs font-medium text-fg-2">
        <Star size={11} aria-hidden />
        {t('routeStartGift', lang)}
      </span>
      <span className="truncate text-xs text-fg">{startGift}</span>
    </>
  ) : startKeyword ? (
    <span className="flex min-w-0 items-center gap-1 text-xs text-fg" title={t('optionStartKeyword', lang)}>
      <Star size={11} aria-hidden className="flex-none text-fg-3" />
      <span className="truncate">{startKeyword}</span>
    </span>
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

  // ---- desktop: columns are floors; floors past the plan share one narrow column ----
  const columns = ['72px', `repeat(${lastFloor}, minmax(0, 1fr))`, outCount > 0 ? '44px' : ''].filter(Boolean).join(' ');
  const outColumn = lastFloor + 2;
  const desktop = (
    <div className="hidden lg:block" data-testid="timetable-columns">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
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
      <div className="grid border-b border-line-strong" style={{ gridTemplateColumns: columns }}>
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
      <div className="relative grid" style={{ gridTemplateColumns: columns, gridTemplateRows: `${laneRows} 36px` }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: columns }}>
          <div className="border-r border-line" />
          {Array.from({ length: lastFloor }, (_, i) => (
            <div key={i} className={`border-r border-line ${bandClass(bandOf(i + 1))}`} />
          ))}
          {outCount > 0 ? <div className="bg-hatch" /> : null}
        </div>
        {startCell ? (
          <div className="relative m-1.5 flex min-w-0 flex-col gap-0.5 rounded-sm border border-line-strong bg-surface px-1.5 py-1.5" style={{ gridColumn: 1, gridRow: 1 }}>
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
          <div key={block.floor.floor} className="relative flex min-w-0 flex-col" style={{ gridColumn: `${block.from + 1} / span ${block.to - block.from + 1}`, gridRow: block.lane + 1 }}>
            <BlockBody block={block} packName={packName} giftName={giftName} lang={lang} orientation="columns" />
          </div>
        ))}
        {fuseFrom !== null && fuseLabel ? (
          <div
            className="relative m-1.5 flex min-w-0 items-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-surface-2 px-2 text-xs text-fg-2"
            style={{ gridColumn: `${Math.min(fuseFrom, lastFloor) + 1} / span ${Math.max(1, lastFloor - Math.min(fuseFrom, lastFloor) + 1)}`, gridRow: lanes + 1 }}
            title={t('routeFuseAt', lang, { floor: fuseFrom })}
          >
            <Store size={12} aria-hidden className="flex-none" />
            <span className="truncate">{fuseLabel}</span>
          </div>
        ) : null}
        {outCount > 0 ? (
          <div
            className="relative flex items-center justify-center px-1 text-center text-xs leading-tight text-fg-3"
            style={{ gridColumn: outColumn, gridRow: `1 / span ${lanes + 1}` }}
            title={`${lastFloor + 1}~${MAX_FLOOR}`}
          >
            {t('routeOutOfRange', lang)}
          </div>
        ) : null}
      </div>
    </div>
  );

  // ---- mobile: rows are floors; a run of free floors is one short row ----
  const { rows, rowOf } = timetableRows(plan.floors, blocks);
  const rowTemplate = rows.map((row) => (row.kind === 'free' ? '40px' : '58px')).join(' ');
  const mobileColumns = `44px repeat(${lanes}, minmax(0, 1fr))`;
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
          <div className="relative m-1.5 flex min-w-0 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2 text-xs text-fg" style={{ gridRow: 1, gridColumn: `2 / span ${lanes}` }}>
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
              <BlockBody block={block} packName={packName} giftName={giftName} lang={lang} orientation="rows" />
            </div>
          );
        })}
      </div>
      {fuseFrom !== null && fuseLabel ? (
        <div className="flex items-center gap-1.5 border-t border-dashed border-line-strong bg-surface-2 px-2.5 py-2 text-xs text-fg-2">
          <Store size={12} aria-hidden className="flex-none" />
          <span className="truncate">
            {t('routeFuseAt', lang, { floor: fuseFrom })} · {fuseLabel}
          </span>
        </div>
      ) : null}
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
