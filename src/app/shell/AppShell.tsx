/**
 * The run-first shell: a header, the stage in the middle, and two collapsible panels — setup on
 * the left (deck, items with the route options), the route, the goals and the T4 tracker on the
 * right. On a desktop the panels sit beside the stage; on a phone they are drawers. The header's
 * reset puts the deck, the items, the route options and the run back to their first state.
 */
import { useEffect, useState } from 'react';
import { Globe, Moon, PanelLeft, PanelRight, RotateCcw, Share2, Sun } from 'lucide-react';
import type { GameData } from '../../core/schema.ts';
import type { DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { useApp, type LeftTab, type RightTab } from '../store.ts';
import { defaultDeck } from '../lib/default-deck.ts';
import { useDesktop } from '../lib/useMediaQuery.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { IconButton } from '../components/ui.tsx';
import { DeckStep } from '../steps/DeckStep.tsx';
import { GiftsStep } from '../steps/GiftsStep.tsx';
import { RunStage } from '../stage/RunStage.tsx';
import { Tracker } from '../tracker/Tracker.tsx';
import { PlanProvider } from './PlanContext.tsx';
import { RoutePlanPanel } from './RoutePlanPanel.tsx';
import { GoalsPanel } from './GoalsPanel.tsx';
import { RouteOptions } from './RouteOptions.tsx';
import { PanelResizer } from './PanelResizer.tsx';
import { SidePanel } from './SidePanel.tsx';

export function AppShell({
  data,
  indexes,
  stats,
  lang,
  dark,
  onShare,
  onToggleLang,
  onToggleDark,
}: {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
  dark: boolean;
  onShare: () => void;
  onToggleLang: () => void;
  onToggleDark: () => void;
}) {
  const ui = useApp((s) => s.ui);
  const setUi = useApp((s) => s.setUi);
  const resetAll = useApp((s) => s.resetAll);
  const desktop = useDesktop();
  // Phones keep their own drawer state: only one drawer at a time, closed on every load.
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  // Crossing the breakpoint leaves the two states disagreeing — a drawer opened on a phone would
  // spring back open, backdrop and all, after the same panel had been closed on a desktop. The
  // desktop layout is the one with a persistent record, so the drawer starts closed each time.
  useEffect(() => {
    if (desktop) setDrawer(null);
  }, [desktop]);
  const leftOpen = desktop ? ui.leftOpen : drawer === 'left';
  const rightOpen = desktop ? ui.rightOpen : drawer === 'right';
  // On a phone a panel is a full-screen page portalled to the body, so the shell behind it is
  // inert: nothing under the page takes focus or a press, and it leaves the accessibility tree.
  const pageOpen = !desktop && drawer !== null;
  const toggle = (side: 'left' | 'right'): void => {
    if (desktop) setUi(side === 'left' ? { leftOpen: !ui.leftOpen } : { rightOpen: !ui.rightOpen });
    else setDrawer((current) => (current === side ? null : side));
  };
  const close = (side: 'left' | 'right'): void => {
    if (desktop) setUi(side === 'left' ? { leftOpen: false } : { rightOpen: false });
    else setDrawer(null);
  };
  const openGifts = (): void => {
    setUi({ leftTab: 'gifts', ...(desktop ? { leftOpen: true } : {}) });
    if (!desktop) setDrawer('left');
  };
  const [confirmReset, setConfirmReset] = useState(false);
  const reset = (): void => {
    setConfirmReset(false);
    resetAll(defaultDeck(data), data.rules.deployment.default);
  };
  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: 'deck', label: t('tabDeck', lang) },
    { id: 'gifts', label: t('tabGifts', lang) },
  ];
  const rightTabs: { id: RightTab; label: string }[] = [
    { id: 'plan', label: t('tabRoutePlan', lang) },
    { id: 'goals', label: t('tabGoals', lang) },
    { id: 'tracker', label: t('tabTracker', lang) },
  ];

  return (
    <PlanProvider data={data} indexes={indexes} stats={stats} lang={lang}>
      <div className="flex min-h-dvh flex-col" data-testid="app-shell" inert={pageOpen || undefined}>
        <header className="sticky top-0 z-30 flex h-[52px] flex-none items-center justify-between border-b border-line bg-surface px-4 lg:h-14 lg:px-6">
          <div className="flex items-center gap-2">
            <IconButton onClick={() => toggle('left')} label={t('panelLeft', lang)} expanded={leftOpen} controls="panel-left">
              <PanelLeft size={15} />
            </IconButton>
            <h1 className="text-base font-bold text-fg">{t('appTitle', lang)}</h1>
          </div>
          <div className="flex gap-1.5">
            <IconButton onClick={() => setConfirmReset(true)} label={t('resetAll', lang)}>
              <RotateCcw size={15} />
            </IconButton>
            <IconButton onClick={onShare} label={t('share', lang)}>
              <Share2 size={15} />
            </IconButton>
            <IconButton onClick={onToggleLang} label={t('langToggle', lang)}>
              <Globe size={15} />
            </IconButton>
            <IconButton onClick={onToggleDark} label={t('themeToggle', lang)}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
            <IconButton onClick={() => toggle('right')} label={t('panelRight', lang)} expanded={rightOpen} controls="panel-right">
              <PanelRight size={15} />
            </IconButton>
          </div>
        </header>

        <div className="flex flex-1 items-start">
          <SidePanel<LeftTab>
            id="panel-left"
            side="left"
            label={t('panelLeft', lang)}
            desktop={desktop}
            open={leftOpen}
            onClose={() => close('left')}
            tabs={leftTabs}
            tab={ui.leftTab}
            onTab={(leftTab) => setUi({ leftTab })}
            lang={lang}
            width={ui.leftWidth}
          >
            {ui.leftTab === 'deck' ? <DeckStep data={data} indexes={indexes} stats={stats} lang={lang} /> : null}
            {ui.leftTab === 'gifts' ? (
              <div className="flex flex-col gap-2.5">
                <GiftsStep data={data} indexes={indexes} stats={stats} lang={lang} onGoDeck={() => setUi({ leftTab: 'deck' })} />
                <RouteOptions />
              </div>
            ) : null}
          </SidePanel>

          {desktop && leftOpen ? <PanelResizer side="left" width={ui.leftWidth} onWidth={(leftWidth) => setUi({ leftWidth })} lang={lang} /> : null}

          <main className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-8 pt-3 lg:px-6 lg:pt-4">
            <RunStage onOpenGifts={openGifts} />
            <footer className="mt-auto border-t border-line pt-3 text-xs text-fg-3">
              <p>
                {t('dataVersion', lang)} {data.meta.dataVersion} · {pick(data.meta.dungeon.name, lang)}
              </p>
              <p className="mt-1">{t('aboutData', lang)}</p>
            </footer>
          </main>

          {desktop && rightOpen ? <PanelResizer side="right" width={ui.rightWidth} onWidth={(rightWidth) => setUi({ rightWidth })} lang={lang} /> : null}

          <SidePanel<RightTab>
            id="panel-right"
            side="right"
            label={t('panelRight', lang)}
            desktop={desktop}
            open={rightOpen}
            onClose={() => close('right')}
            tabs={rightTabs}
            tab={ui.rightTab}
            onTab={(rightTab) => setUi({ rightTab })}
            lang={lang}
            width={ui.rightWidth}
          >
            {ui.rightTab === 'plan' ? <RoutePlanPanel onOpenGifts={openGifts} /> : ui.rightTab === 'goals' ? <GoalsPanel onOpenGifts={openGifts} /> : <Tracker />}
          </SidePanel>
        </div>
        {confirmReset ? (
          <ConfirmDialog title={t('resetAll', lang)} message={t('resetAllConfirm', lang)} confirmLabel={t('resetAll', lang)} onConfirm={reset} onCancel={() => setConfirmReset(false)} lang={lang} />
        ) : null}
      </div>
    </PlanProvider>
  );
}
