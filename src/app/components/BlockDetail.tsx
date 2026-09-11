/**
 * What a timetable block cannot show inside its fixed cell: the pack, its floor window, other
 * candidate packs, and every pickup with its condition. Desktop shows it as a popover beside the
 * block; a phone opens it as a bottom sheet. The same surface explains an observed gift from the
 * start cell and lets it be pinned or released.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Eye, X } from 'lucide-react';
import type { GameIndexes, ObservedGift } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import type { Judgement } from '../lib/judgement.ts';
import type { Block } from '../lib/timetable.ts';
import { useDismiss } from '../lib/useDismiss.ts';
import { GiftIcon } from './GiftIcon.tsx';
import { PackImage } from './PackImage.tsx';
import { Badge, Button } from './ui.tsx';

export type DetailMode = 'popover' | 'sheet';

export interface DetailContext {
  indexes: GameIndexes;
  judgements: Map<number, Judgement | null>;
  /** The condition sentence(s) for a gift, if it has any. */
  giftTitle: (id: number) => string | undefined;
  packName: (id: number) => string;
  isMust: (id: number) => boolean;
  /** Whether the season's observation pool includes the gift. */
  observable: (id: number) => boolean;
  observed: ReadonlySet<number>;
  /** Pin or unpin an observation; absent when the timetable is read-only. */
  onToggleObserved?: (giftId: number) => void;
  lang: Lang;
}

/** Popover or bottom-sheet chrome around a detail body. Escape and an outside press close it. */
export function DetailSurface({
  mode,
  label,
  closeLabel,
  onClose,
  placement,
  children,
}: {
  mode: DetailMode;
  label: string;
  closeLabel: string;
  onClose: () => void;
  /** Popover only: which side of the block it opens on. */
  placement?: { vertical: 'below' | 'above'; horizontal: 'start' | 'end' };
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The popover lives inside its block, whose own dismiss handling covers it.
  useDismiss(ref, onClose, mode === 'sheet');
  // The surface renders inside the block that opens it, so its own presses must not reopen it.
  const stop = { onClick: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation() };
  useEffect(() => {
    if (mode === 'sheet') ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [mode]);
  if (mode === 'sheet') {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          data-testid="block-sheet"
          {...stop}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-md border-t border-line-strong bg-surface px-4 pb-6 pt-2 shadow-pop lg:hidden"
        >
          <div className="mb-2 flex items-center">
            <span className="mx-auto h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="absolute right-3 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </>
    );
  }
  const vertical = placement?.vertical === 'above' ? { bottom: '100%' } : { top: '100%' };
  const horizontal = placement?.horizontal === 'end' ? { right: 0 } : { left: 0 };
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-testid="block-popover"
      {...stop}
      className="absolute z-30 w-[300px] rounded-md border border-line-strong bg-surface p-3 text-fg shadow-pop"
      style={{ ...vertical, ...horizontal }}
    >
      {children}
    </div>
  );
}

function PickupRow({ giftId, ctx }: { giftId: number; ctx: DetailContext }) {
  const gift = ctx.indexes.giftById.get(giftId);
  if (!gift) return null;
  const condition = ctx.giftTitle(giftId);
  const pinned = ctx.observed.has(giftId);
  const canObserve = ctx.onToggleObserved && ctx.observable(giftId);
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <GiftIcon gift={gift} size={44} judgement={ctx.judgements.get(giftId) ?? null} must={ctx.isMust(giftId)} lang={ctx.lang} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{pick(gift.name, ctx.lang)}</span>
          {ctx.isMust(giftId) ? <Badge tone="sure">{t('priorityMust', ctx.lang)}</Badge> : null}
        </div>
        {condition ? <span className="text-xs text-fg-2">{condition}</span> : null}
      </div>
      {canObserve ? (
        <Button size="sm" variant={pinned ? 'primary' : 'ghost'} onClick={() => ctx.onToggleObserved?.(giftId)} ariaLabel={t('routeObservedToggle', ctx.lang, { name: pick(gift.name, ctx.lang) })}>
          <Eye size={12} aria-hidden />
          {pinned ? t('routeObservedPinned', ctx.lang) : t('routeObserved', ctx.lang)}
        </Button>
      ) : null}
    </li>
  );
}

/** The body for a pack block: pack, window, candidates, pickups. */
export function BlockDetailBody({ block, ctx }: { block: Block; ctx: DetailContext }) {
  const { floor, from, to } = block;
  const pack = ctx.indexes.packById.get(floor.packId!);
  const where = from === to ? t('routeFixedFloor', ctx.lang, { floor: from }) : t('routeWindow', ctx.lang, { from, to, pick: floor.floor });
  const candidates = floor.alternatives.slice(0, 3);
  const pickups = floor.pickups.filter((p) => p.kind === 'exclusive');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {pack ? <PackImage pack={pack} size={40} lang={ctx.lang} /> : null}
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{ctx.packName(floor.packId!)}</span>
          <span className="text-xs text-fg-2">{where}</span>
        </div>
      </div>
      {candidates.length > 0 ? (
        <div className="text-xs text-fg-3">
          {t('routeCandidates', ctx.lang)}: {candidates.map(ctx.packName).join(', ')}
        </div>
      ) : null}
      {pickups.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {pickups.map((p) => (
            <PickupRow key={p.giftId} giftId={p.giftId} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The body for an observed gift from the start cell. */
export function ObservedDetailBody({ entry, ctx }: { entry: ObservedGift; ctx: DetailContext }) {
  const gift = ctx.indexes.giftById.get(entry.giftId);
  if (!gift) return null;
  const why = entry.pinned
    ? t('routeObservedPinned', ctx.lang)
    : entry.freedPack !== null
      ? t('routeObservedFrees', ctx.lang, { pack: ctx.packName(entry.freedPack) })
      : t('routeObservedRescue', ctx.lang);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <GiftIcon gift={gift} size={44} judgement={ctx.judgements.get(entry.giftId) ?? null} must={ctx.isMust(entry.giftId)} lang={ctx.lang} />
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{pick(gift.name, ctx.lang)}</span>
          <span className="text-xs text-fg-2">
            {t('routeObserved', ctx.lang)} · {why}
          </span>
        </div>
      </div>
      {ctx.giftTitle(entry.giftId) ? <span className="text-xs text-fg-2">{ctx.giftTitle(entry.giftId)}</span> : null}
      {ctx.onToggleObserved ? (
        <Button variant={entry.pinned ? 'primary' : 'secondary'} onClick={() => ctx.onToggleObserved?.(entry.giftId)} ariaLabel={t('routeObservedToggle', ctx.lang, { name: pick(gift.name, ctx.lang) })}>
          <Eye size={12} aria-hidden />
          {entry.pinned ? t('routeObservedPinned', ctx.lang) : t('routeObservedRecommended', ctx.lang)}
        </Button>
      ) : null}
    </div>
  );
}
