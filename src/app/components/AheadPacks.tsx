/**
 * While a run is being tracked: the packs the player can still enter from the current floor, by
 * band, each with its exclusive gifts. Opening one shows its gift list, where gifts can be added
 * as goals and the pack itself can be included in the route.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { ThemePack } from '../../core/schema.ts';
import { pick, t } from '../i18n.ts';
import { DetailSurface } from './BlockDetail.tsx';
import { PackCard } from './PackCard.tsx';
import { PackSheetBody, PackStateBadge, type PackContext } from './PackSheet.tsx';
import { Badge, Card, SectionTitle } from './ui.tsx';

const BANDS: { from: number; to: number; mode: 'hard' | 'parallel' | 'extreme'; key: 'optionBandHard' | 'optionBandParallel' | 'optionBandExtreme' }[] = [
  { from: 1, to: 5, mode: 'hard', key: 'optionBandHard' },
  { from: 6, to: 10, mode: 'parallel', key: 'optionBandParallel' },
  { from: 11, to: 15, mode: 'extreme', key: 'optionBandExtreme' },
];

function isDesktop(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
}

export function AheadPacks({ ctx, currentFloor }: { ctx: PackContext; currentFloor: number }) {
  const { lang } = ctx;
  const bands = BANDS.filter((band) => band.to >= currentFloor);
  const [bandIndex, setBandIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [openPack, setOpenPack] = useState<number | null>(null);
  const band = bands[Math.min(bandIndex, bands.length - 1)];

  // Packs offered on at least one floor of the band that is still ahead.
  const packs = useMemo(() => {
    if (!band) return [];
    const ids = new Set<number>();
    for (let floor = Math.max(band.from, currentFloor); floor <= band.to; floor += 1) {
      for (const id of ctx.indexes.packsByFloor[band.mode].get(floor) ?? []) ids.add(id);
    }
    const q = query.trim().toLowerCase();
    const matches = (pack: ThemePack): boolean => {
      if (q === '') return true;
      if (pick(pack.name, lang).toLowerCase().includes(q)) return true;
      return pack.exclusiveGifts.some((id) => ctx.giftName(id).toLowerCase().includes(q));
    };
    return [...ids]
      .map((id) => ctx.indexes.packById.get(id))
      .filter((pack): pack is ThemePack => pack !== undefined && matches(pack))
      .sort((a, b) => a.id - b.id);
  }, [band, currentFloor, ctx, query, lang]);

  if (bands.length === 0 || !band) return null;

  const sheet = (packId: number): ReactNode =>
    openPack === packId ? (
      <DetailSurface mode={isDesktop() ? 'popover' : 'sheet'} label={ctx.packName(packId)} closeLabel={t('routeClose', lang)} onClose={() => setOpenPack(null)}>
        <PackSheetBody packId={packId} ctx={ctx} />
      </DetailSurface>
    ) : null;

  return (
    <Card className="overflow-visible p-3.5" testId="ahead-packs">
      <SectionTitle right={<span className="font-mono text-xs text-fg-3">{packs.length}</span>}>{t('aheadPacks', lang)}</SectionTitle>
      <p className="mt-1 text-xs text-fg-3">{t('aheadPacksHint', lang)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div role="tablist" aria-label={t('aheadPacks', lang)} className="flex flex-wrap gap-1.5">
          {bands.map((entry, i) => {
            const on = entry === band;
            return (
              <button
                key={entry.from}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setBandIndex(i)}
                className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs ${on ? 'border-ink bg-ink text-ink-fg' : 'border-line-strong bg-surface text-fg-2 hover:bg-surface-2'}`}
              >
                {t(entry.key, lang)}
              </button>
            );
          })}
        </div>
        <label className="ml-auto inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs text-fg-2">
          <Search size={12} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('aheadSearch', lang)}
            placeholder={t('aheadSearch', lang)}
            className="w-32 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
          />
        </label>
      </div>
      {packs.length === 0 ? (
        <p className="mt-3 text-xs text-fg-3">{t('aheadNone', lang)}</p>
      ) : (
        <ul className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {packs.map((pack) => {
            const wantedHere = pack.exclusiveGifts.filter((id) => ctx.wanted.has(id)).length;
            return (
              <li key={pack.id} className="relative flex gap-2 rounded-md border border-line bg-surface p-2" data-testid="ahead-pack" data-pack={pack.id}>
                <PackCard pack={pack} size={48} caption onOpen={setOpenPack} selected={ctx.preferred.has(pack.id)} lang={lang} />
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                  <PackStateBadge packId={pack.id} ctx={ctx} />
                  <span className="text-fg-2">{t('aheadExclusives', lang, { n: pack.exclusiveGifts.length })}</span>
                  {wantedHere > 0 ? <Badge tone="start">{`${t('giftWanted', lang)} ${wantedHere}`}</Badge> : null}
                </div>
                {sheet(pack.id)}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
