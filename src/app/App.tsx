import { useEffect, useMemo, useState } from 'react';
import { Globe, Moon, RefreshCw, Share2, Sun, TriangleAlert, Hourglass } from 'lucide-react';
import type { GameData } from '../core/schema.ts';
import { analyseDeck, buildIndexes } from '../core/index.ts';
import { loadGameData } from '../core/data/load.ts';
import { t } from './i18n.ts';
import { decodeShared, encodeShared, useApp, type Step } from './store.ts';
import { badgeFor } from './lib/labels.ts';
import { deckSummaryChips } from './lib/deck-summary.ts';
import { Button, Card, IconButton, Skeleton, Toast } from './components/ui.tsx';
import { Stepper } from './components/Stepper.tsx';
import { SummaryStrip } from './components/SummaryStrip.tsx';
import { DeckStep } from './steps/DeckStep.tsx';
import { GiftsStep } from './steps/GiftsStep.tsx';
import { RouteStep } from './steps/RouteStep.tsx';

export function App() {
  const lang = useApp((s) => s.lang);
  const dark = useApp((s) => s.dark);
  const step = useApp((s) => s.step);
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const wanted = useApp((s) => s.wanted);
  const priority = useApp((s) => s.priority);
  const setLang = useApp((s) => s.setLang);
  const toggleDark = useApp((s) => s.toggleDark);
  const setStep = useApp((s) => s.setStep);
  const applyShared = useApp((s) => s.applyShared);

  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sharedCopied, setSharedCopied] = useState(false);

  // A share link must win over whatever localStorage remembers, or the link would not work. The
  // hash is consumed once and dropped from the URL, or a later reload would undo the user's edits.
  useEffect(() => {
    if (!window.location.hash) return;
    const shared = decodeShared(window.location.hash);
    if (shared) applyShared(shared);
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

  const indexes = useMemo(() => (data ? buildIndexes(data) : null), [data]);
  const stats = useMemo(
    () => (data && indexes ? analyseDeck(deck, indexes, data.rules.deployment, deployed) : null),
    [data, indexes, deck, deployed],
  );

  const share = async (): Promise<void> => {
    const state = useApp.getState();
    const hash = encodeShared({ deck: state.deck, deployed: state.deployed, wanted: state.wanted, priority: state.priority, options: state.options });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    await navigator.clipboard.writeText(url);
    setSharedCopied(true);
    window.setTimeout(() => setSharedCopied(false), 2000);
  };

  const disabledSteps: Step[] = deck.length === 0 ? [2, 3] : [];
  const counts: Partial<Record<Step, string>> = {
    1: `${deck.length}/12`,
    2: wanted.length > 0 ? String(wanted.length) : undefined,
  };
  const goStep = (next: Step): void => {
    if (!disabledSteps.includes(next)) setStep(next);
  };
  const effectiveStep: Step = disabledSteps.includes(step) ? 1 : step;

  const summaryItems = (() => {
    if (!data || !stats || effectiveStep === 1) return [];
    const deckItems = [
      { label: t('deckDeployedCount', lang, { n: stats.deployed.length, max: data.rules.deployment.max }) },
      ...deckSummaryChips(stats, data.enums, lang)
        .slice(0, effectiveStep === 2 ? 5 : 1)
        .map((c) => ({ label: `${c.label} ${c.count}`, title: t('deckFormationCount', lang, { n: c.formation }) })),
    ];
    if (effectiveStep === 2) return deckItems;
    const kinds = wanted.map((id) => badgeFor(indexes!.giftById.get(id)?.acquisition.kind ?? 'unknown').badge);
    const count = (badge: string) => kinds.filter((k) => k === badge).length;
    const must = wanted.filter((id) => priority[id] === 'must').length;
    const skipped = wanted.filter((id) => priority[id] === 'skip').length;
    return [
      ...deckItems,
      { label: t('giftsSelected', lang, { n: wanted.length }) },
      ...(must ? [{ label: `${t('priorityMust', lang)} ${must}` }] : []),
      ...(skipped ? [{ label: `${t('prioritySkip', lang)} ${skipped}` }] : []),
      ...(count('sure') ? [{ label: `${t('acqSure', lang)} ${count('sure')}` }] : []),
      ...(count('maybe') ? [{ label: `${t('acqMaybe', lang)} ${count('maybe')}` }] : []),
      ...(count('fuse') ? [{ label: `${t('acqFuse', lang)} ${count('fuse')}` }] : []),
    ];
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[52px] flex-none items-center justify-between border-b border-line bg-surface px-4 lg:h-14 lg:px-8">
        <h1 className="text-base font-bold text-fg">{t('appTitle', lang)}</h1>
        <div className="flex gap-1.5">
          <IconButton onClick={share} label={t('share', lang)}>
            <Share2 size={15} />
          </IconButton>
          <IconButton onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} label={t('langToggle', lang)}>
            <Globe size={15} />
          </IconButton>
          <IconButton onClick={toggleDark} label={t('themeToggle', lang)}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1184px] flex-1 flex-col gap-3 px-4 pb-20 pt-3 lg:gap-3.5 lg:px-8 lg:pb-8 lg:pt-4">
        {error ? (
          <div className="flex flex-1 items-center justify-center py-10">
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
        ) : !data || !indexes || !stats ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-[88px]" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 12 }, (_, i) => (
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
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stepper step={effectiveStep} counts={counts} disabled={disabledSteps} onStep={goStep} lang={lang} variant="desktop" />
              <SummaryStrip items={summaryItems} />
            </div>
            {effectiveStep === 1 ? <DeckStep data={data} indexes={indexes} stats={stats} lang={lang} /> : null}
            {effectiveStep === 2 ? <GiftsStep data={data} indexes={indexes} stats={stats} lang={lang} /> : null}
            {effectiveStep === 3 ? <RouteStep data={data} indexes={indexes} stats={stats} lang={lang} /> : null}
            <footer className="mt-auto border-t border-line pt-3 text-xs text-fg-3">
              <p>
                {t('dataVersion', lang)} {data.meta.dataVersion} · {data.meta.dungeon.name.ko}
              </p>
              <p className="mt-1">{t('aboutData', lang)}</p>
            </footer>
          </>
        )}
      </main>

      {data && !error ? (
        <Stepper step={effectiveStep} counts={counts} disabled={disabledSteps} onStep={goStep} lang={lang} variant="mobile" />
      ) : null}
      {sharedCopied ? <Toast>{t('shared', lang)}</Toast> : null}
    </div>
  );
}
