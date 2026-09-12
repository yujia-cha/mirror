/**
 * The packs the player can enter on the stage floor: the ones the route allows here (the
 * suggested one first), a card for passing the floor without a pack, and a search over every
 * pack the game can offer on this floor. A card is dragged down into the drop zone to enter, or
 * entered with its button.
 */
import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { ArrowDown, DoorClosed, LogIn, Search } from 'lucide-react';
import type { ThemePack } from '../../core/schema.ts';
import { pick, t } from '../i18n.ts';
import type { EnterablePack } from '../lib/stage.ts';
import type { DragHandlers, DragState } from '../lib/useDragEnter.ts';
import { DetailSurface } from '../components/BlockDetail.tsx';
import { PackCard } from '../components/PackCard.tsx';
import { PackSheetBody, PackStateBadge, type PackContext } from '../components/PackSheet.tsx';
import { Badge, Button } from '../components/ui.tsx';

export type DragId = number | 'skip';

const CARD_CLASS = 'relative flex w-[150px] flex-none flex-col gap-2 rounded-md border bg-surface p-2.5 shadow-card select-none';

export function StagePackCard({
  pack,
  recommended,
  ctx,
  exclusivesOf,
  handlers,
  dragging,
  onEnter,
}: {
  pack: ThemePack;
  recommended: boolean;
  ctx: PackContext;
  exclusivesOf: (packId: number) => number[];
  handlers: DragHandlers;
  dragging: boolean;
  onEnter: (packId: number) => void;
}) {
  const { lang } = ctx;
  const [open, setOpen] = useState(false);
  const exclusives = exclusivesOf(pack.id);
  const wantedHere = exclusives.filter((id) => ctx.wanted.has(id)).length;
  const name = pick(pack.name, lang);
  return (
    <div
      {...handlers}
      className={`${CARD_CLASS} ${recommended ? 'border-ink' : 'border-line'} ${dragging ? 'opacity-40' : ''}`}
      style={{ touchAction: 'pan-x' }}
      data-testid="stage-pack"
      data-pack={pack.id}
      data-recommended={recommended || undefined}
    >
      <div className="flex items-start gap-2">
        <PackCard pack={pack} size={48} caption lang={lang} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          {recommended ? <Badge tone="sure">{t('stageRecommended', lang)}</Badge> : <PackStateBadge packId={pack.id} ctx={ctx} />}
          <span className="text-fg-2">{t('aheadExclusives', lang, { n: exclusives.length })}</span>
          {wantedHere > 0 ? <span className="font-medium text-fg">{`${t('giftWanted', lang)} ${wantedHere}`}</span> : null}
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" className="flex-1" onClick={() => onEnter(pack.id)} ariaLabel={t('stageEnterPack', lang, { name })}>
          <LogIn size={12} aria-hidden />
          {t('stageEnter', lang)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} ariaLabel={`${name} ${t('stageDetail', lang)}`}>
          {t('stageDetail', lang)}
        </Button>
      </div>
      {open ? (
        <DetailSurface mode="sheet" label={name} closeLabel={t('routeClose', lang)} onClose={() => setOpen(false)}>
          <PackSheetBody packId={pack.id} ctx={ctx} />
        </DetailSurface>
      ) : null}
    </div>
  );
}

export function SkipCard({ handlers, dragging, onSkip, lang }: { handlers: DragHandlers; dragging: boolean; onSkip: () => void; lang: PackContext['lang'] }) {
  return (
    <div {...handlers} className={`${CARD_CLASS} border-dashed border-line-strong ${dragging ? 'opacity-40' : ''}`} style={{ touchAction: 'pan-x' }} data-testid="skip-card">
      <div className="flex items-start gap-2">
        <span className="flex h-[90px] w-12 flex-none items-center justify-center rounded-sm border border-dashed border-line-strong text-fg-3" aria-hidden>
          <DoorClosed size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          <span className="text-sm font-medium">{t('stageSkip', lang)}</span>
          <span className="text-fg-3">{t('stageSkipHint', lang)}</span>
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onSkip}>
        {t('stageSkip', lang)}
      </Button>
    </div>
  );
}

export function DropZone({ zoneRef, over, active, lang }: { zoneRef: RefObject<HTMLDivElement | null>; over: boolean; active: boolean; lang: PackContext['lang'] }) {
  return (
    <div
      ref={zoneRef}
      role="region"
      aria-label={t('stageDropZone', lang)}
      data-testid="drop-zone"
      data-over={over || undefined}
      className={`flex min-h-24 items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm transition-colors ${
        over ? 'border-ink bg-surface-2 text-fg' : active ? 'border-line-strong text-fg-2' : 'border-line text-fg-3'
      }`}
    >
      <ArrowDown size={16} aria-hidden />
      {active ? t('stageDropZone', lang) : t('stageDropHint', lang)}
    </div>
  );
}

export function DragGhost({ drag, label, children }: { drag: DragState<DragId>; label: string; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-ink bg-surface p-2 shadow-pop"
      style={{ left: drag.startRect.left + drag.dx, top: drag.startRect.top + drag.dy, width: drag.startRect.width }}
      aria-hidden
      data-testid="drag-ghost"
    >
      {children}
      <div className="mt-1 text-center text-[11px] text-fg-2">{label}</div>
    </div>
  );
}

/** Every pack the game can offer on this floor, searchable by pack or exclusive gift name. */
export function OtherPacks({
  offered,
  exclude,
  ctx,
  exclusivesOf,
  onEnter,
}: {
  offered: number[];
  exclude: ReadonlySet<number>;
  ctx: PackContext;
  exclusivesOf: (packId: number) => number[];
  onEnter: (packId: number) => void;
}) {
  const { lang } = ctx;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const packs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offered
      .filter((id) => !exclude.has(id))
      .map((id) => ctx.indexes.packById.get(id))
      .filter((pack): pack is ThemePack => pack !== undefined)
      .filter((pack) => q === '' || pick(pack.name, lang).toLowerCase().includes(q) || exclusivesOf(pack.id).some((id) => ctx.giftName(id).toLowerCase().includes(q)))
      .sort((a, b) => a.id - b.id);
  }, [offered, exclude, ctx, query, lang, exclusivesOf]);
  return (
    <details className="rounded-md border border-line bg-surface" data-testid="other-packs">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-2">
        {t('stageOtherPacks', lang)} <span className="font-mono text-xs text-fg-3">{packs.length}</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-line px-3 py-2">
        <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs text-fg-2">
          <Search size={12} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('stageOtherSearch', lang)} placeholder={t('stageOtherSearch', lang)} className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3" />
        </label>
        {packs.length === 0 ? (
          <p className="text-xs text-fg-3">{t('stageOtherNone', lang)}</p>
        ) : (
          <ul className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {packs.map((pack) => {
              const name = pick(pack.name, lang);
              const wantedHere = exclusivesOf(pack.id).filter((id) => ctx.wanted.has(id)).length;
              return (
                <li key={pack.id} className="relative flex items-center gap-2 rounded-sm border border-line px-2 py-1.5" data-testid="other-pack" data-pack={pack.id}>
                  <PackCard pack={pack} size={28} onOpen={setOpen} lang={lang} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {name}
                    {wantedHere > 0 ? <span className="ml-1 text-xs text-fg-2">{`${t('giftWanted', lang)} ${wantedHere}`}</span> : null}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => onEnter(pack.id)} ariaLabel={t('stageEnterPack', lang, { name })}>
                    <LogIn size={12} aria-hidden />
                    {t('stageEnter', lang)}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {/* The sheet lives outside the list: adding a goal from it can move the pack to the route row. */}
      {open !== null ? (
        <DetailSurface mode="sheet" label={pick(ctx.indexes.packById.get(open)?.name, lang)} closeLabel={t('routeClose', lang)} onClose={() => setOpen(null)}>
          <PackSheetBody packId={open} ctx={ctx} />
        </DetailSurface>
      ) : null}
    </details>
  );
}

export type { EnterablePack };
