/**
 * The route settings tab: the starting keyword, which wanted gifts are pinned for observation,
 * the packs the player chose to include or give up, and the resets.
 */
import { Eye, RefreshCw, RotateCcw } from 'lucide-react';
import type { Keyword } from '../../core/schema.ts';
import { pick, t } from '../i18n.ts';
import { useApp } from '../store.ts';
import { PackCard } from '../components/PackCard.tsx';
import { PackActions } from '../components/PackSheet.tsx';
import { GiftIcon } from '../components/GiftIcon.tsx';
import { Button, Card, SectionTitle } from '../components/ui.tsx';
import { usePlan } from './PlanContext.tsx';

export function RouteSettings() {
  const { data, indexes, lang, ctx, giftName } = usePlan();
  const options = useApp((s) => s.options);
  const wanted = useApp((s) => s.wanted);
  const setOptions = useApp((s) => s.setOptions);
  const resetOptions = useApp((s) => s.resetOptions);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const resetRun = useApp((s) => s.resetRun);
  const max = data.rules.giftObservation.max;
  const observable = wanted.filter((id) => ctx.observable(id));
  const chosenPacks = [...new Set([...options.preferredPacks, ...options.bannedPacks])].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3" data-testid="route-settings">
      <Card className="flex flex-col gap-2 px-3.5 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-3">{t('optionStartKeyword', lang)}</span>
          <select
            aria-label={t('optionStartKeyword', lang)}
            value={options.startKeyword}
            onChange={(event) => setOptions({ startKeyword: event.target.value as Keyword | 'auto' })}
            className="h-[30px] rounded-full border border-line bg-surface-2 px-2.5 text-xs text-fg-2"
          >
            <option value="auto">{t('optionAuto', lang)}</option>
            {data.enums.keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {pick(k.name, lang)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-fg-3">{t('routeAllPlanned', lang)}</span>
      </Card>

      <Card className="px-3.5 py-3" testId="settings-observed">
        <SectionTitle right={<span className="font-mono text-xs text-fg-3">{`${options.observedGifts.length}/${max}`}</span>}>{t('settingsObserved', lang)}</SectionTitle>
        <p className="mt-1 text-xs text-fg-3">{t('settingsObservedHint', lang, { max })}</p>
        {observable.length === 0 ? (
          <p className="mt-2 text-xs text-fg-3">{t('settingsNone', lang)}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {observable.map((id) => {
              const gift = indexes.giftById.get(id);
              if (!gift) return null;
              const pinned = options.observedGifts.includes(id);
              return (
                <li key={id} className="flex items-center gap-2">
                  <GiftIcon gift={gift} size={32} judgement={ctx.judgements.get(id) ?? null} must={ctx.isMust(id)} lang={lang} />
                  <span className="min-w-0 flex-1 truncate text-sm">{giftName(id)}</span>
                  <Button
                    size="sm"
                    variant={pinned ? 'primary' : 'ghost'}
                    disabled={!pinned && options.observedGifts.length >= max}
                    onClick={() => toggleObserved(id, max)}
                    ariaLabel={t('routeObservedToggle', lang, { name: giftName(id) })}
                  >
                    <Eye size={12} aria-hidden />
                    {pinned ? t('routeObservedPinned', lang) : t('routeObserved', lang)}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="px-3.5 py-3" testId="settings-packs">
        <SectionTitle>{t('settingsPreferred', lang)}</SectionTitle>
        {chosenPacks.length === 0 ? (
          <p className="mt-2 text-xs text-fg-3">{t('settingsNone', lang)}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {chosenPacks.map((packId) => {
              const pack = indexes.packById.get(packId);
              if (!pack) return null;
              return (
                <li key={packId} className="flex items-center gap-2" data-testid="settings-pack" data-pack={packId}>
                  <PackCard pack={pack} size={28} lang={lang} />
                  <span className={`min-w-0 flex-1 truncate text-sm ${options.bannedPacks.includes(packId) ? 'line-through text-fg-3' : ''}`}>{pick(pack.name, lang)}</span>
                  <PackActions packId={packId} ctx={ctx} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={resetOptions}>
          <RefreshCw size={12} aria-hidden />
          {t('optionReset', lang)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (typeof window.confirm !== 'function' || window.confirm(t('stageNewRunConfirm', lang))) resetRun();
          }}
        >
          <RotateCcw size={12} aria-hidden />
          {t('stageNewRun', lang)}
        </Button>
      </div>
    </div>
  );
}
