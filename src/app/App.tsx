import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { GameData } from '../core/schema.ts';
import { buildIndexes } from '../core/index.ts';
import { loadGameData } from '../core/data/load.ts';
import { t } from './i18n.ts';
import { decodeShared, encodeShared, useApp } from './store.ts';
import { Button } from './ui.tsx';
import { DeckPanel } from './DeckPanel.tsx';
import { GiftPanel } from './GiftPanel.tsx';
import { OptionsPanel, RoutePanel } from './RoutePanel.tsx';

type Tab = 'deck' | 'gifts' | 'route';

export function App() {
  const lang = useApp((s) => s.lang);
  const dark = useApp((s) => s.dark);
  const setLang = useApp((s) => s.setLang);
  const toggleDark = useApp((s) => s.toggleDark);
  const applyShared = useApp((s) => s.applyShared);

  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('deck');
  const [sharedCopied, setSharedCopied] = useState(false);

  // A share link must win over whatever localStorage remembers, or the link would not work.
  useEffect(() => {
    const shared = decodeShared(window.location.hash);
    if (shared) applyShared(shared);
  }, [applyShared]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    loadGameData(import.meta.env.BASE_URL, { validate: import.meta.env.DEV })
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexes = useMemo(() => (data ? buildIndexes(data) : null), [data]);

  const share = async (): Promise<void> => {
    const state = useApp.getState();
    const hash = encodeShared({ deck: state.deck, wanted: state.wanted, options: state.options });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, '', hash);
    await navigator.clipboard.writeText(url);
    setSharedCopied(true);
    window.setTimeout(() => setSharedCopied(false), 2000);
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{t('appTitle', lang)}</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('appTagline', lang)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={share} variant="ghost">
              {sharedCopied ? t('shared', lang) : t('share', lang)}
            </Button>
            <Button onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} variant="ghost">
              {t('langToggle', lang)}
            </Button>
            <Button onClick={toggleDark} variant="ghost" title={t('themeToggle', lang)}>
              {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm dark:border-rose-500/40 dark:bg-rose-500/10">
            <p className="font-medium">{t('loadFailed', lang)}</p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">{error}</p>
            <div className="mt-3">
              <Button onClick={() => window.location.reload()}>{t('retry', lang)}</Button>
            </div>
          </div>
        ) : !data || !indexes ? (
          <p className="py-16 text-center text-sm text-stone-500">{t('loading', lang)}</p>
        ) : (
          <>
            <nav className="mb-4 flex gap-1 lg:hidden" aria-label={t('appTitle', lang)}>
              {(['deck', 'gifts', 'route'] as Tab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  aria-current={tab === value}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                    tab === value
                      ? 'bg-amber-500 text-stone-950'
                      : 'border border-stone-200 dark:border-stone-700'
                  }`}
                >
                  {t(value === 'deck' ? 'tabDeck' : value === 'gifts' ? 'tabGifts' : 'tabRoute', lang)}
                </button>
              ))}
            </nav>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className={`space-y-4 ${tab === 'deck' ? '' : 'hidden lg:block'}`}>
                <DeckPanel data={data} indexes={indexes} lang={lang} />
                <OptionsPanel data={data} lang={lang} />
              </div>
              <div className={tab === 'gifts' ? '' : 'hidden lg:block'}>
                <GiftPanel data={data} indexes={indexes} lang={lang} />
              </div>
              <div className={tab === 'route' ? '' : 'hidden lg:block'}>
                <RoutePanel data={data} indexes={indexes} lang={lang} />
              </div>
            </div>

            <footer className="mt-8 border-t border-stone-200 pt-4 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
              <p>
                {t('dataVersion', lang)} {data.meta.dataVersion} · {data.meta.dungeon.name.ko} ·{' '}
                {data.meta.counts.gifts} gifts / {data.meta.counts.packs} packs /{' '}
                {data.meta.counts.identities} identities
              </p>
              <p className="mt-1">{t('aboutData', lang)}</p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
