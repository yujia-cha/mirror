/**
 * The run-first shell: a header, the stage in the middle, and two collapsible panels — setup on
 * the left (deck, items, route settings), the route and the T4 tracker on the right. On a desktop
 * the panels sit beside the stage; on a phone they are drawers.
 */
import { useState } from 'react';
import { Globe, Moon, PanelLeft, PanelRight, Share2, Sun } from 'lucide-react';
import type { GameData } from '../../core/schema.ts';
import type { DeckStats, GameIndexes } from '../../core/types.ts';
import { t, type Lang } from '../i18n.ts';
import { useApp, type LeftTab, type RightTab } from '../store.ts';
import { useDesktop } from '../lib/useMediaQuery.ts';
import { IconButton } from '../components/ui.tsx';
import { DeckStep } from '../steps/DeckStep.tsx';
import { GiftsStep } from '../steps/GiftsStep.tsx';
import { RunStage } from '../stage/RunStage.tsx';
import { Tracker } from '../tracker/Tracker.tsx';
import { PlanProvider } from './PlanContext.tsx';
import { RoutePlanPanel } from './RoutePlanPanel.tsx';
import { GoalsPanel } from './GoalsPanel.tsx';
import { RouteSettings } from './RouteSettings.tsx';
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
  const desktop = useDesktop();
  // Phones keep their own drawer state: only one drawer at a time, closed on every load.
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const leftOpen = desktop ? ui.leftOpen : drawer === 'left';
  const rightOpen = desktop ? ui.rightOpen : drawer === 'right';
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
  const leftTabs: { id: LeftTab; label: string }[] = [
    { id: 'deck', label: t('tabDeck', lang) },
    { id: 'gifts', label: t('tabGifts', lang) },
    { id: 'settings', label: t('tabRouteSettings', lang) },
  ];
  const rightTabs: { id: RightTab; label: string }[] = [
    { id: 'plan', label: t('tabRoutePlan', lang) },
    { id: 'goals', label: t('tabGoals', lang) },
    { id: 'tracker', label: t('tabTracker', lang) },
  ];

  return (
    <PlanProvider data={data} indexes={indexes} stats={stats} lang={lang}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-[52px] flex-none items-center justify-between border-b border-line bg-surface px-4 lg:h-14 lg:px-6">
          <div className="flex items-center gap-2">
            <IconButton onClick={() => toggle('left')} label={t('panelLeft', lang)} expanded={leftOpen} controls="panel-left">
              <PanelLeft size={15} />
            </IconButton>
            <h1 className="text-base font-bold text-fg">{t('appTitle', lang)}</h1>
          </div>
          <div className="flex gap-1.5">
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
            {ui.leftTab === 'gifts' ? <GiftsStep data={data} indexes={indexes} stats={stats} lang={lang} onGoDeck={() => setUi({ leftTab: 'deck' })} /> : null}
            {ui.leftTab === 'settings' ? <RouteSettings /> : null}
          </SidePanel>

          {desktop && leftOpen ? <PanelResizer side="left" width={ui.leftWidth} onWidth={(leftWidth) => setUi({ leftWidth })} lang={lang} /> : null}

          <main className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-8 pt-3 lg:px-6 lg:pt-4">
            <RunStage onOpenGifts={openGifts} />
            <footer className="mt-auto border-t border-line pt-3 text-xs text-fg-3">
              <p>
                {t('dataVersion', lang)} {data.meta.dataVersion} · {data.meta.dungeon.name.ko}
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
      </div>
    </PlanProvider>
  );
}
