import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert, Hourglass } from 'lucide-react';
import type { GameData } from '../core/schema.ts';
import { analyseDeck, buildIndexes } from '../core/index.ts';
import { loadGameData } from '../core/data/load.ts';
import { t } from './i18n.ts';
import { decodeShared, encodeShared, useApp } from './store.ts';
import { defaultDeck } from './lib/default-deck.ts';
import { Button, Card, Skeleton, Toast } from './components/ui.tsx';
import { AppShell } from './shell/AppShell.tsx';

export function App() {
  const lang = useApp((s) => s.lang);
  const dark = useApp((s) => s.dark);
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const wanted = useApp((s) => s.wanted);
  const priority = useApp((s) => s.priority);
  const fusionGoal = useApp((s) => s.fusionGoal);
  const setLang = useApp((s) => s.setLang);
  const toggleDark = useApp((s) => s.toggleDark);
  const applyShared = useApp((s) => s.applyShared);
  const reconcile = useApp((s) => s.reconcile);
  const setDeck = useApp((s) => s.setDeck);

  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sharedCopied, setSharedCopied] = useState(false);
  const [linkBroken, setLinkBroken] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // A share link must win over whatever localStorage remembers, or the link would not work. The
  // hash is consumed once and dropped from the URL, or a later reload would undo the user's edits.
  // A hash that says nothing to us is left in place: dropping it silently took away the only copy
  // of a link the reader might still want to re-open or pass on.
  useEffect(() => {
    if (!window.location.hash.startsWith('#s=')) return;
    const shared = decodeShared(window.location.hash);
    if (!shared) {
      setLinkBroken(true);
      return;
    }
    applyShared(shared);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [applyShared]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
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
  }, [attempt]);

  // A first visit starts from the deck everyone owns; a share link or a saved deck arrives first
  // and wins. Seeding happens once, so emptying the deck by hand is not undone on the next render.
  const seeded = useRef(false);
  const indexes = useMemo(() => (data ? buildIndexes(data) : null), [data]);
  useEffect(() => {
    if (!data || !indexes || seeded.current) return;
    seeded.current = true;
    // A link or a saved state can outlive a data refresh; anything this season cannot resolve goes
    // before it reaches the screen.
    reconcile({ gift: (id) => indexes.giftById.has(id), pack: (id) => indexes.packById.has(id) });
    if (useApp.getState().deck.length === 0) setDeck(defaultDeck(data), data.rules.deployment.default);
  }, [data, indexes, reconcile, setDeck]);

  const stats = useMemo(
    () => (data && indexes ? analyseDeck(deck, indexes, data.rules.deployment, deployed) : null),
    [data, indexes, deck, deployed],
  );

  const share = async (): Promise<void> => {
    const url = `${window.location.origin}${window.location.pathname}${encodeShared({ deck, deployed, wanted, priority, fusionGoal, options: useApp.getState().options })}`;
    // Plain http and an unfocused document both leave `navigator.clipboard` unusable. Saying so
    // beats an unhandled rejection nobody sees.
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 3000);
      return;
    }
    setSharedCopied(true);
    window.setTimeout(() => setSharedCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <Card variant="strong" className="flex max-w-[360px] flex-col items-center gap-2.5 px-6 py-6 text-center">
          <TriangleAlert size={28} aria-hidden />
          <div className="text-sm font-semibold">{t('loadFailed', lang)}</div>
          <div className="text-xs text-fg-3">
            {error}
            <br />
            {t('loadFailedHint', lang)}
          </div>
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={14} aria-hidden />
            {t('retry', lang)}
          </Button>
        </Card>
      </div>
    );
  }

  if (!data || !indexes || !stats) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[960px] flex-col gap-3 px-4 py-6" aria-busy="true">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[88px]" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-[96px] flex-col gap-2 rounded-md border border-line bg-surface p-3">
              <Skeleton className="h-2.5 w-2/5" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-3">
          <Hourglass size={13} aria-hidden />
          {t('loading', lang)}
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell data={data} indexes={indexes} stats={stats} lang={lang} dark={dark} onShare={share} onToggleLang={() => setLang(lang === 'ko' ? 'en' : 'ko')} onToggleDark={toggleDark} />
      {sharedCopied ? <Toast>{t('shared', lang)}</Toast> : null}
      {copyFailed ? <Toast tone="alert">{t('copyFailed', lang)}</Toast> : null}
      {linkBroken ? <Toast tone="alert">{t('linkBroken', lang)}</Toast> : null}
    </>
  );
}
