/**
 * A gift the player marks as got or not: a pressable tile whose look carries the state — not got
 * is greyscale and dimmed, got is full colour with a check, missed (decided by the run) is dimmed
 * with a cross and a press turns it into got. A goal gift wears a ring so it stands out among
 * the rest of a pack's drops.
 */
import type { Gift } from '../../core/schema.ts';
import { pick, t, type Lang } from '../i18n.ts';
import type { Judgement } from '../lib/judgement.ts';
import type { GiftStatus } from '../lib/plan-input.ts';
import { GiftIcon, type GiftIconSize } from './GiftIcon.tsx';

export function GiftTile({
  gift,
  status,
  wanted = false,
  must = false,
  judgement = null,
  size = 44,
  title,
  onToggle,
  lang,
}: {
  gift: Gift;
  status: GiftStatus | null;
  wanted?: boolean;
  must?: boolean;
  judgement?: Judgement | null;
  size?: GiftIconSize;
  title?: string;
  onToggle: (next: GiftStatus | null) => void;
  lang: Lang;
}) {
  const name = pick(gift.name, lang);
  const got = status === 'got';
  const width = Math.max(size + 16, 64);
  return (
    <button
      type="button"
      onClick={() => onToggle(got ? null : 'got')}
      aria-pressed={got}
      aria-label={t('giftTileToggle', lang, { name })}
      title={title ? `${name} · ${title}` : name}
      data-testid="gift-tile"
      data-gift={gift.id}
      data-status={status ?? 'pending'}
      data-wanted={wanted || undefined}
      className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center transition-[filter,opacity] ${
        wanted ? 'border-ink ring-1 ring-ink' : 'border-line'
      } ${status === null ? 'grayscale opacity-55 hover:opacity-80' : status === 'failed' ? 'opacity-45' : 'bg-surface'}`}
      style={{ width }}
    >
      <GiftIcon gift={gift} size={size} judgement={judgement} must={must} status={status} lang={lang} />
      <span className="line-clamp-2 w-full break-keep text-[10px] leading-tight text-fg" aria-hidden>
        {name}
      </span>
    </button>
  );
}
