/**
 * Everything about one theme pack, opened from any pack card: the card and name, the floors it
 * can sit on, its place in the current plan, every exclusive gift it drops (plus wanted pool
 * gifts), and the pack-level choices — include it somewhere, or give it up.
 */
import { Ban, Check, Eye, MapPin, Plus, RotateCcw, X } from 'lucide-react';
import type { ThemePack } from '../../core/schema.ts';
import type { GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import type { Judgement } from '../lib/judgement.ts';
import type { GiftStatus } from '../lib/plan-input.ts';
import { GiftIcon } from './GiftIcon.tsx';
import { PackCard } from './PackCard.tsx';
import { Badge, Button, Segmented } from './ui.tsx';

/** The run in progress, as the pack surfaces see it. */
export interface RunContext {
  currentFloor: number;
  /** The floor the pack was entered on, or null. */
  visitedAt: (packId: number) => number | null;
  giftStatus: (giftId: number) => GiftStatus | null;
  /** Begin choosing the floor this pack was entered on (the map takes over). */
  onVisit: (packId: number) => void;
  onUnvisit: (packId: number) => void;
  onGiftStatus: (giftId: number, status: GiftStatus | null) => void;
}

/** What every pack surface needs to know; built once by the route step. */
export interface PackContext {
  indexes: GameIndexes;
  judgements: Map<number, Judgement | null>;
  giftTitle: (id: number) => string | undefined;
  giftName: (id: number) => string;
  packName: (id: number) => string;
  isMust: (id: number) => boolean;
  observable: (id: number) => boolean;
  observed: ReadonlySet<number>;
  wanted: ReadonlySet<number>;
  preferred: ReadonlySet<number>;
  banned: ReadonlySet<number>;
  /** The floor the shown plan gives the pack, or null. */
  assignedAt: (packId: number) => number | null;
  onPrefer?: (packId: number) => void;
  onBan?: (packId: number) => void;
  onRestore?: (packId: number) => void;
  onToggleObserved?: (giftId: number) => void;
  /** Add or remove a gift as a goal (from a pack's gift list). */
  onToggleWanted?: (giftId: number) => void;
  /** Present while a run is being tracked. */
  run?: RunContext;
  lang: Lang;
}

function ranges(floors: number[]): string {
  const sorted = [...floors].sort((a, b) => a - b);
  const out: string[] = [];
  for (const f of sorted) {
    const last = out[out.length - 1];
    if (last && Number(last.split('~').pop()) === f - 1) out[out.length - 1] = `${last.split('~')[0]}~${f}`;
    else out.push(String(f));
  }
  return out.join(', ');
}

/** "Hard 4~5 · 평행중첩 6~10": where the pack can be picked, by run mode. */
function packFloorsText(pack: ThemePack, lang: Lang): string {
  const parts: string[] = [];
  if (pack.availability.normal.length > 0) parts.push(`${t('modeNormal', lang)} ${ranges(pack.availability.normal)}`);
  if (pack.availability.hard.length > 0) parts.push(`${t('modeHard', lang)} ${ranges(pack.availability.hard)}`);
  if (pack.availability.parallel.length > 0) parts.push(`${t('modeParallel', lang)} ${ranges(pack.availability.parallel)}`);
  if (pack.availability.extreme.length > 0) parts.push(`${t('modeExtreme', lang)} ${ranges(pack.availability.extreme)}`);
  return parts.join(' · ');
}

export function PackStateBadge({ packId, ctx }: { packId: number; ctx: PackContext }) {
  const at = ctx.assignedAt(packId);
  const visited = ctx.run?.visitedAt(packId) ?? null;
  if (visited !== null) return <Badge tone="sure">{t('runVisitedShort', ctx.lang, { floor: visited })}</Badge>;
  if (ctx.banned.has(packId)) return <Badge tone="neutral">{t('packBanned', ctx.lang)}</Badge>;
  if (at !== null)
    return (
      <Badge tone="sure" title={ctx.preferred.has(packId) ? t('packPreferred', ctx.lang) : undefined}>
        {t('packIncluded', ctx.lang, { floor: at })}
      </Badge>
    );
  if (ctx.preferred.has(packId)) return <Badge tone="alert">{t('packPreferred', ctx.lang)}</Badge>;
  return <Badge tone="neutral">{t('packNotInRoute', ctx.lang)}</Badge>;
}

/** Include / give up / restore for one pack. */
export function PackActions({ packId, ctx, size = 'sm' }: { packId: number; ctx: PackContext; size?: 'sm' | 'md' }) {
  const name = ctx.packName(packId);
  if (ctx.banned.has(packId)) {
    return ctx.onRestore ? (
      <Button size={size} variant="ghost" onClick={() => ctx.onRestore?.(packId)} ariaLabel={`${name} ${t('packRestore', ctx.lang)}`}>
        <RotateCcw size={12} aria-hidden />
        {t('packRestore', ctx.lang)}
      </Button>
    ) : null;
  }
  const preferred = ctx.preferred.has(packId);
  const exclusiveMust = ctx.indexes.packById.get(packId)?.exclusiveGifts.filter((id) => ctx.wanted.has(id) && ctx.isMust(id)) ?? [];
  const ban = (): void => {
    if (exclusiveMust.length > 0 && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(t('packBanConfirm', ctx.lang, { gift: exclusiveMust.map(ctx.giftName).join(', ') }))) return;
    }
    ctx.onBan?.(packId);
  };
  return (
    <span className="flex flex-wrap gap-1.5">
      {ctx.onPrefer ? (
        <Button
          size={size}
          variant={preferred ? 'primary' : 'secondary'}
          onClick={() => (preferred ? ctx.onRestore?.(packId) : ctx.onPrefer?.(packId))}
          ariaLabel={`${name} ${t('packInclude', ctx.lang)}`}
          title={preferred ? t('packPreferred', ctx.lang) : undefined}
        >
          <Check size={12} aria-hidden />
          {t('packInclude', ctx.lang)}
        </Button>
      ) : null}
      {ctx.onBan ? (
        <Button size={size} variant="danger" onClick={ban} ariaLabel={`${name} ${t('packBan', ctx.lang)}`}>
          <Ban size={12} aria-hidden />
          {t('packBan', ctx.lang)}
        </Button>
      ) : null}
    </span>
  );
}

function GiftRow({ giftId, exclusive, ctx }: { giftId: number; exclusive: boolean; ctx: PackContext }) {
  const gift = ctx.indexes.giftById.get(giftId);
  if (!gift) return null;
  const name = pick(gift.name, ctx.lang);
  const wanted = ctx.wanted.has(giftId);
  const pinned = ctx.observed.has(giftId);
  const canObserve = wanted && ctx.onToggleObserved !== undefined && ctx.observable(giftId) && !ctx.run;
  const condition = ctx.giftTitle(giftId);
  const status = ctx.run?.giftStatus(giftId) ?? null;
  return (
    <li className="flex items-start gap-2.5 py-1.5" data-testid="pack-gift" data-gift={giftId} data-wanted={wanted || undefined} data-status={status ?? undefined}>
      <GiftIcon gift={gift} size={44} judgement={ctx.judgements.get(giftId) ?? null} must={ctx.isMust(giftId)} status={status} lang={ctx.lang} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-sm ${wanted ? 'font-semibold' : 'font-medium text-fg-2'}`}>{name}</span>
          {exclusive ? <Badge tone="sure">{t('giftExclusive', ctx.lang)}</Badge> : null}
          {wanted ? <Badge tone="start">{t('giftWanted', ctx.lang)}</Badge> : null}
          {ctx.isMust(giftId) ? <Badge tone="alert">{t('priorityMust', ctx.lang)}</Badge> : null}
        </div>
        {condition ? <span className="text-xs text-fg-2">{condition}</span> : null}
        {ctx.run && wanted ? (
          <Segmented<'pending' | 'got' | 'failed'>
            label={t('giftStatusLabel', ctx.lang, { name })}
            value={status ?? 'pending'}
            options={[
              { value: 'pending', label: t('giftStatusPending', ctx.lang) },
              { value: 'got', label: t('giftStatusGot', ctx.lang) },
              { value: 'failed', label: t('giftStatusFailed', ctx.lang) },
            ]}
            onChange={(value) => ctx.run?.onGiftStatus(giftId, value === 'pending' ? null : value)}
          />
        ) : null}
      </div>
      {canObserve ? (
        <Button size="sm" variant={pinned ? 'primary' : 'ghost'} onClick={() => ctx.onToggleObserved?.(giftId)} ariaLabel={t('routeObservedToggle', ctx.lang, { name })}>
          <Eye size={12} aria-hidden />
          {pinned ? t('routeObservedPinned', ctx.lang) : t('routeObserved', ctx.lang)}
        </Button>
      ) : null}
      {ctx.onToggleWanted ? (
        <Button size="sm" variant={wanted ? 'ghost' : 'secondary'} onClick={() => ctx.onToggleWanted?.(giftId)} ariaLabel={`${name} ${wanted ? t('giftRemoveGoal', ctx.lang) : t('giftAddGoal', ctx.lang)}`}>
          {wanted ? <X size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
          {wanted ? t('giftRemoveGoal', ctx.lang) : t('giftAddGoal', ctx.lang)}
        </Button>
      ) : null}
    </li>
  );
}

/** Run progress for a pack: mark the floor it was entered on, or undo that. */
function VisitActions({ packId, ctx }: { packId: number; ctx: PackContext }) {
  if (!ctx.run) return null;
  const visited = ctx.run.visitedAt(packId);
  const name = ctx.packName(packId);
  return (
    <span className="flex flex-wrap gap-1.5" data-testid="visit-actions">
      <Button size="sm" variant={visited === null ? 'primary' : 'secondary'} onClick={() => ctx.run?.onVisit(packId)} ariaLabel={`${name} ${t('runSetVisit', ctx.lang)}`}>
        <MapPin size={12} aria-hidden />
        {t('runSetVisit', ctx.lang)}
      </Button>
      {visited !== null ? (
        <Button size="sm" variant="ghost" onClick={() => ctx.run?.onUnvisit(packId)} ariaLabel={`${name} ${t('runUnvisit', ctx.lang)}`}>
          <RotateCcw size={12} aria-hidden />
          {t('runUnvisit', ctx.lang)}
        </Button>
      ) : null}
    </span>
  );
}

/** The sheet / popover body for a pack. */
export function PackSheetBody({ packId, ctx }: { packId: number; ctx: PackContext }) {
  const pack = ctx.indexes.packById.get(packId);
  if (!pack) return null;
  const exclusives = new Set(pack.exclusiveGifts);
  const gifts = [...new Set([...pack.exclusiveGifts, ...pack.giftPool.filter((id) => ctx.wanted.has(id))])].sort(
    (a, b) => Number(ctx.wanted.has(b)) - Number(ctx.wanted.has(a)) || a - b,
  );
  return (
    <div className="flex flex-col gap-2.5" data-testid="pack-sheet-body">
      <div className="flex items-start gap-3">
        <PackCard pack={pack} size={96} lang={ctx.lang} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-semibold">{pick(pack.name, ctx.lang)}</span>
          <span className="text-xs text-fg-2">{packFloorsText(pack, ctx.lang)}</span>
          <PackStateBadge packId={packId} ctx={ctx} />
          <PackActions packId={packId} ctx={ctx} />
          <VisitActions packId={packId} ctx={ctx} />
          {ctx.run ? <span className="text-xs text-fg-3">{t('runSetVisitHint', ctx.lang)}</span> : null}
        </div>
      </div>
      <div className="text-xs font-medium text-fg-2">
        {t('packGifts', ctx.lang)} <span className="font-mono text-fg-3">{gifts.length}</span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {gifts.map((id) => (
          <GiftRow key={id} giftId={id} exclusive={exclusives.has(id)} ctx={ctx} />
        ))}
      </ul>
    </div>
  );
}
