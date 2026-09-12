/**
 * The T4 tracker: the pack-independent tier-4+ gifts, grouped by series, each a tile pressed when
 * it is in hand. Marking 달의 기억 reminds the player that its fusion consumed two shards and three
 * memories, listing the ones still marked as held so they can be unmarked in place.
 */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { pick, t } from '../i18n.ts';
import { useApp } from '../store.ts';
import { fusionConsumption, trackerGifts, type TrackerGroupId } from '../lib/tracker.ts';
import { GiftIcon } from '../components/GiftIcon.tsx';
import { GiftTile } from '../components/GiftTile.tsx';
import { Button, Card, Notice, SectionTitle } from '../components/ui.tsx';
import { usePlan } from '../shell/PlanContext.tsx';

const GROUP_KEY: Record<TrackerGroupId, 'trackerGroupKeyword' | 'trackerGroupShard' | 'trackerGroupMemory' | 'trackerGroupAttack' | 'trackerGroupPlain'> = {
  keyword: 'trackerGroupKeyword',
  shard: 'trackerGroupShard',
  memory: 'trackerGroupMemory',
  attack: 'trackerGroupAttack',
  plain: 'trackerGroupPlain',
};

export function Tracker() {
  const { data, indexes, lang, ctx, goals } = usePlan();
  const giftStatus = useApp((s) => s.run.giftStatus);
  const setGiftStatus = useApp((s) => s.setGiftStatus);
  const groups = useMemo(() => trackerGifts(data, indexes), [data, indexes]);
  const [notice, setNotice] = useState<number | null>(null);
  const noticeGift = notice !== null ? indexes.giftById.get(notice) : undefined;
  const consumption = noticeGift && giftStatus[noticeGift.id] === 'got' ? fusionConsumption(noticeGift, giftStatus) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="tracker">
      <div>
        <div className="text-sm font-semibold">{t('trackerTitle', lang)}</div>
        <p className="mt-1 text-xs text-fg-3">{t('trackerHint', lang)}</p>
      </div>
      {consumption && noticeGift ? (
        <Notice strong>
          <div className="flex flex-col gap-2" data-testid="fusion-notice">
            <div className="flex items-start gap-2">
              <span className="flex-1">{t('trackerFusionNotice', lang, { a: consumption.aCount, b: consumption.bCount })}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label={t('routeClose', lang)} className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full hover:bg-surface-2">
                <X size={13} aria-hidden />
              </button>
            </div>
            {consumption.aGot.length + consumption.bGot.length > 0 ? (
              <ul className="flex flex-col gap-1">
                <li className="text-xs text-fg-3">{t('trackerFusionHeld', lang)}</li>
                {[...consumption.aGot, ...consumption.bGot].map((id) => {
                  const gift = indexes.giftById.get(id);
                  return gift ? (
                    <li key={id} className="flex items-center gap-2">
                      <GiftIcon gift={gift} size={20} status="got" lang={lang} />
                      <span className="min-w-0 flex-1 truncate text-sm">{pick(gift.name, lang)}</span>
                      <Button size="sm" variant="secondary" onClick={() => setGiftStatus(id, null)} ariaLabel={`${pick(gift.name, lang)} ${t('trackerUnmark', lang)}`}>
                        {t('trackerUnmark', lang)}
                      </Button>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : null}
          </div>
        </Notice>
      ) : null}
      {groups.map((group) => (
        <Card key={group.id} className="px-3 py-2.5" testId={`tracker-${group.id}`}>
          <SectionTitle right={<span className="font-mono text-xs text-fg-3">{`${group.gifts.filter((g) => giftStatus[g.id] === 'got').length}/${group.gifts.length}`}</span>}>
            {t(GROUP_KEY[group.id], lang)}
          </SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.gifts.map((gift) => (
              <GiftTile
                key={gift.id}
                gift={gift}
                size={32}
                status={giftStatus[gift.id] ?? null}
                wanted={goals.has(gift.id)}
                must={ctx.isMust(gift.id)}
                onToggle={(next) => {
                  setGiftStatus(gift.id, next);
                  // Only marking the mixed-fusion result raises the reminder; unmarking closes it.
                  if (gift.fusion?.mixed) setNotice(next === 'got' ? gift.id : null);
                }}
                lang={lang}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
