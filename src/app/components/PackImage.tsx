/**
 * A theme pack's artwork slot. Same placeholder rule as GiftIcon: grey until an asset host is set.
 */
import { useState } from 'react';
import { Image } from 'lucide-react';
import type { ThemePack } from '../../core/schema.ts';
import { pick, type Lang } from '../i18n.ts';
import { packImageUrl } from '../lib/assets.ts';

export function PackImage({ pack, size, lang }: { pack: ThemePack; size: 24 | 28 | 32 | 40; lang: Lang }) {
  const [failed, setFailed] = useState(false);
  const url = packImageUrl(pack.sprite);
  return (
    <span
      role="img"
      aria-label={pick(pack.name, lang)}
      data-testid="pack-image"
      className="inline-flex flex-none items-center justify-center overflow-hidden rounded-sm border border-line bg-surface-3 text-fg-3"
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Image size={Math.round(size * 0.5)} aria-hidden className="opacity-40" />
      )}
    </span>
  );
}
