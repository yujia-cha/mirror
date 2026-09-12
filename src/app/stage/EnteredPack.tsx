/**
 * A floor with a pack recorded: the pack on the left, and on the right every gift only this
 * pack drops, goals first, each a tile the player presses when it is in hand.
 */
import { RotateCcw } from 'lucide-react';
import { pick, t } from '../i18n.ts';
import { useApp } from '../store.ts';
import { GiftTile } from '../components/GiftTile.tsx';
import { PackCard } from '../components/PackCard.tsx';
import { Badge, Button } from '../components/ui.tsx';
import { usePlan } from '../shell/PlanContext.tsx';

export function EnteredPack({ packId, floor }: { packId: number; floor: number }) {
  const { indexes, lang, ctx, exclusivesOf, goals } = usePlan();
  const giftStatus = useApp((s) => s.run.giftStatus);
  const setGiftStatus = useApp((s) => s.setGiftStatus);
  const unvisitPack = useApp((s) => s.unvisitPack);
  const pack = indexes.packById.get(packId);
  if (!pack) return null;
  const name = pick(pack.name, lang);
  const exclusives = [...exclusivesOf(packId)].sort((a, b) => Number(goals.has(b)) - Number(goals.has(a)) || a - b);
  const goalCount = exclusives.filter((id) => goals.has(id)).length;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_minmax(0,1fr)]" data-testid="entered-pack" data-pack={packId}>
      <div className="flex flex-col items-center gap-2 md:w-[150px]">
        <PackCard pack={pack} size={96} lang={lang} />
        <span className="text-center text-sm font-semibold">{name}</span>
        <Badge tone="sure">{t('stageEntered', lang, { floor })}</Badge>
        <Button size="sm" variant="ghost" onClick={() => unvisitPack(packId)} ariaLabel={`${name} ${t('stageUnenter', lang)}`}>
          <RotateCcw size={12} aria-hidden />
          {t('stageUnenter', lang)}
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{t('stageExclusives', lang)}</span>
          <span className="font-mono text-xs text-fg-3">{exclusives.length}</span>
          {goalCount > 0 ? <span className="text-xs text-fg-2">{`${t('stageGoalsFirst', lang)} ${goalCount}`}</span> : null}
        </div>
        <p className="text-xs text-fg-3">{t('stageGotHint', lang)}</p>
        {exclusives.length === 0 ? (
          <p className="text-xs text-fg-3">{t('stageExclusivesNone', lang)}</p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="exclusive-gifts">
            {exclusives.map((id) => {
              const gift = indexes.giftById.get(id);
              return gift ? (
                <GiftTile
                  key={id}
                  gift={gift}
                  size={44}
                  status={giftStatus[id] ?? null}
                  wanted={goals.has(id)}
                  must={ctx.isMust(id)}
                  judgement={ctx.judgements.get(id) ?? null}
                  title={ctx.giftTitle(id)}
                  onToggle={(next) => setGiftStatus(id, next)}
                  lang={lang}
                />
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
