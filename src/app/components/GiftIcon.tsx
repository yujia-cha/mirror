/**
 * An E.G.O gift as a square tile. Artwork loads from the asset host when one is configured and
 * otherwise a grey placeholder stands in; the border carries the condition judgement (green =
 * met, red = not met, dashed = cannot judge), which is the one place the palette uses hue.
 */
import { useState } from 'react';
import { Gem, Star } from 'lucide-react';
import type { Gift } from '../../core/schema.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { giftIconUrl } from '../lib/assets.ts';
import type { Judgement } from '../lib/judgement.ts';

export type GiftIconSize = 20 | 32 | 44;

const BORDER: Record<Judgement, string> = {
  met: 'border-2 border-ok',
  unmet: 'border-2 border-bad',
  unknown: 'border-2 border-dashed border-line-strong',
};

const JUDGEMENT_KEY = { met: 'condMet', unmet: 'condUnmet', unknown: 'giftUnjudgeable' } as const;

export function GiftIcon({
  gift,
  size,
  judgement = null,
  name = false,
  must = false,
  title,
  lang,
}: {
  gift: Gift;
  size: GiftIconSize;
  judgement?: Judgement | null;
  /** Show the gift name under the tile. */
  name?: boolean;
  /** Extra hover text after the name (a condition sentence, a reason). */
  title?: string;
  /** The user marked this gift 반드시; drawn as a star badge. */
  must?: boolean;
  lang: Lang;
}) {
  const [failed, setFailed] = useState(false);
  const url = giftIconUrl(gift.icon);
  const label = pick(gift.name, lang);
  const judged = judgement ? t(JUDGEMENT_KEY[judgement], lang) : null;
  const aria = [must ? t('priorityMust', lang) : null, judged, label].filter(Boolean).join(' · ');
  const border = judgement ? BORDER[judgement] : 'border border-line';
  const tile = (
    <span
      role="img"
      aria-label={aria}
      title={title ? `${label} · ${title}` : label}
      data-testid="gift-icon"
      data-judgement={judgement ?? 'none'}
      data-must={must || undefined}
      className={`relative inline-flex flex-none items-center justify-center overflow-hidden rounded-sm bg-surface-3 text-fg-3 ${border}`}
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Gem size={Math.round(size * 0.45)} aria-hidden className="opacity-40" />
      )}
      {must ? (
        <span className="absolute left-0 top-0 rounded-br-sm bg-ink p-px text-ink-fg" aria-hidden>
          <Star size={size >= 32 ? 9 : 7} fill="currentColor" />
        </span>
      ) : null}
      {size >= 32 && gift.tier !== null ? (
        <span className="absolute bottom-0 right-0 rounded-tl-sm bg-surface px-0.5 font-mono text-[9px] leading-[11px] text-fg-2">T{gift.tier}</span>
      ) : null}
    </span>
  );
  if (!name) return tile;
  return (
    <span className="flex min-w-0 flex-col items-center gap-0.5" style={{ width: Math.max(size, 52) }}>
      {tile}
      <span className="line-clamp-2 w-full break-keep text-center text-[10px] leading-tight text-fg" aria-hidden>
        {label}
      </span>
    </span>
  );
}
