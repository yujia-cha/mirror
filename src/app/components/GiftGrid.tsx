/**
 * The gifts to pick from, as tiles rather than rows: portrait, name, and the one condition that
 * decides whether the deck activates it. Pressing the tile makes it a goal; pressing the name
 * opens its sheet. An upgrade child (조합 계승) follows its parent and locks once the parent is a
 * goal, because choosing the parent already carries it.
 */
import { CornerDownRight, Check, Link2 } from 'lucide-react';
import type { Enums, Gift } from '../../core/schema.ts';
import { t, pick, type Lang } from '../i18n.ts';
import type { GiftEntry } from '../lib/gift-priority.ts';
import { conditionShort, decidingReport } from '../lib/gift-condition.ts';
import { judgementOf } from '../lib/judgement.ts';
import { GiftIcon } from './GiftIcon.tsx';

export interface GiftTileData {
  entry: GiftEntry;
  /** The upgrade parent this tile hangs under, when it is a child. */
  parent?: Gift;
}

export function GiftTileGrid({
  tiles,
  wanted,
  entangled,
  enums,
  lang,
  onToggle,
  onOpen,
}: {
  tiles: GiftTileData[];
  wanted: readonly number[];
  entangled: ReadonlySet<number>;
  enums: Enums;
  lang: Lang;
  onToggle: (gift: Gift) => void;
  onOpen: (giftId: number) => void;
}) {
  return (
    <div className="grid gap-1.5 p-2 [grid-template-columns:repeat(auto-fill,minmax(64px,1fr))]" data-testid="gift-grid">
      {tiles.map(({ entry, parent }) => {
        const gift = entry.gift;
        const name = pick(gift.name, lang);
        const held = parent ? wanted.includes(parent.id) : false;
        const selected = wanted.includes(gift.id);
        const report = decidingReport(entry.reports, entry.lack);
        const condition = conditionShort(report, enums, lang);
        const marked = selected || held;
        return (
          <div
            key={gift.id}
            id={`gift-${gift.id}`}
            className={`relative flex flex-col items-center gap-[3px] rounded-md bg-surface px-1 pb-1.5 pt-2 ${marked ? 'border border-ink ring-1 ring-ink' : 'border border-line'} ${held ? 'opacity-55' : ''}`}
            style={{ contentVisibility: 'auto', containIntrinsicSize: '84px' }}
            data-testid="gift-tile"
            data-gift={gift.id}
            data-selected={selected || undefined}
            data-locked={held || undefined}
            data-entangled={entangled.has(gift.id) || undefined}
            title={parent ? t('giftSubOf', lang, { parent: pick(parent.name, lang) }) : undefined}
          >
            {marked ? (
              <span className="absolute right-0.5 top-0.5 z-10 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink text-ink-fg" aria-hidden>
                <Check size={9} strokeWidth={3} />
              </span>
            ) : null}
            {entangled.has(gift.id) ? (
              <span className="absolute left-0.5 top-0.5 z-10 text-fg-2" aria-hidden title={t('giftEntangled', lang)}>
                <Link2 size={11} />
              </span>
            ) : null}
            {parent ? (
              <span className="absolute left-0.5 top-5 z-10 text-fg-3" aria-hidden>
                <CornerDownRight size={10} />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onToggle(gift)}
              disabled={held}
              aria-pressed={marked}
              aria-label={name}
              className="inline-flex disabled:cursor-default"
            >
              <GiftIcon gift={gift} size={32} judgement={judgementOf(entry.reports)} lang={lang} />
            </button>
            <button
              type="button"
              onClick={() => onOpen(gift.id)}
              aria-haspopup="dialog"
              aria-label={t('giftDetail', lang, { name })}
              className="line-clamp-2 h-[24px] w-full break-keep text-center text-[10px] font-medium leading-tight text-fg underline-offset-2 hover:underline"
            >
              {name}
            </button>
            <span className={`min-h-[13px] font-mono text-[10px] leading-[13px] ${report?.satisfied ? 'text-fg' : 'text-fg-3'}`}>{condition ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}
