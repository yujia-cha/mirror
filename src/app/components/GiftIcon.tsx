/**
 * An E.G.O gift as a square tile. Artwork loads from the asset host when one is configured and
 * otherwise a grey placeholder stands in. The border tells the gift's keyword: the seven status
 * keywords each have a hue, the three attack types a line shape (slash dashed, pierce dotted,
 * blunt double), and a gift with none keeps the plain grey line. The condition judgement sits
 * outside the border as a ring (green = met, red = not met, grey = cannot judge). These are the
 * only places the palette uses hue.
 */
import { useState } from 'react';
import { Check, Gem, Star, X } from 'lucide-react';
import type { Gift, Keyword } from '../../core/schema.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { giftIconUrl } from '../lib/assets.ts';
import type { Judgement } from '../lib/judgement.ts';

export type GiftIconSize = 20 | 32 | 44;

const KEYWORD_BORDER: Record<Keyword, string> = {
  Combustion: 'border-2 border-kw-combustion',
  Laceration: 'border-2 border-kw-laceration',
  Vibration: 'border-2 border-kw-vibration',
  Burst: 'border-2 border-kw-burst',
  Sinking: 'border-2 border-kw-sinking',
  Breath: 'border-2 border-kw-breath',
  Charge: 'border-2 border-kw-charge',
  Slash: 'border-2 border-dashed border-fg-2',
  Penetrate: 'border-2 border-dotted border-fg-2',
  Hit: 'border-[3px] border-double border-fg-2',
  None: 'border border-line',
};

const RING: Record<Judgement, string> = {
  met: 'ring-2 ring-ok ring-offset-1 ring-offset-surface',
  unmet: 'ring-2 ring-bad ring-offset-1 ring-offset-surface',
  unknown: 'ring-2 ring-line-strong ring-offset-1 ring-offset-surface',
};

const JUDGEMENT_KEY = { met: 'condMet', unmet: 'condUnmet', unknown: 'giftUnjudgeable' } as const;

export function GiftIcon({
  gift,
  size,
  judgement = null,
  name = false,
  must = false,
  status = null,
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
  /** Run progress: collected (check badge) or missed (dimmed, cross badge). */
  status?: 'got' | 'failed' | null;
  lang: Lang;
}) {
  const [failed, setFailed] = useState(false);
  const url = giftIconUrl(gift.icon);
  const label = pick(gift.name, lang);
  const judged = judgement ? t(JUDGEMENT_KEY[judgement], lang) : null;
  const statusText = status === 'got' ? t('giftStatusGot', lang) : status === 'failed' ? t('giftStatusFailed', lang) : null;
  const aria = [must ? t('priorityMust', lang) : null, statusText, judged, label].filter(Boolean).join(' · ');
  const border = KEYWORD_BORDER[gift.keyword] ?? KEYWORD_BORDER.None;
  const ring = judgement ? RING[judgement] : '';
  const tile = (
    <span
      role="img"
      aria-label={aria}
      title={title ? `${label} · ${title}` : label}
      data-testid="gift-icon"
      data-keyword={gift.keyword}
      data-judgement={judgement ?? 'none'}
      data-must={must || undefined}
      data-status={status ?? undefined}
      className={`relative inline-flex flex-none items-center justify-center overflow-hidden rounded-sm bg-surface-3 text-fg-3 ${border} ${ring} ${status === 'failed' ? 'opacity-50' : ''}`}
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
      {status ? (
        <span className={`absolute right-0 top-0 rounded-bl-sm p-px ${status === 'got' ? 'bg-ink text-ink-fg' : 'bg-surface text-fg'}`} aria-hidden>
          {status === 'got' ? <Check size={size >= 32 ? 10 : 8} strokeWidth={3} /> : <X size={size >= 32 ? 10 : 8} strokeWidth={3} />}
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
