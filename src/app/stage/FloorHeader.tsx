/**
 * The top of the stage: the floor on stage as a big number with its band, the previous/next
 * controls, and a strip of the fifteen floors that mirrors the route (planned or entered pack,
 * played, skipped, the frontier) and lets the player look back at a played floor.
 */
import { ChevronLeft, ChevronRight, LogIn } from 'lucide-react';
import { t, type Lang } from '../i18n.ts';
import { APP_LAST_FLOOR, useApp } from '../store.ts';
import { bandMode, stageModeFor, type StageMode } from '../lib/stage.ts';
import { Badge, Button } from '../components/ui.tsx';
import { usePlan } from '../shell/PlanContext.tsx';

const BAND_KEY = { hard: 'optionBandHard', parallel: 'optionBandParallel', extreme: 'optionBandExtreme' } as const;

/** The entered pack is named by the caller; here only the pack-less states get a badge. */
function modeBadge(mode: StageMode, lang: Lang) {
  if (mode === 'skipped') return <Badge tone="neutral">{t('stageSkipped', lang)}</Badge>;
  if (mode === 'done') return <Badge tone="sure">{t('stageDone', lang)}</Badge>;
  return null;
}

export function FloorHeader({ mode }: { mode: StageMode }) {
  const { lang, shown, packName, next, prev } = usePlan();
  const run = useApp((s) => s.run);
  const setStageFloor = useApp((s) => s.setStageFloor);
  const floor = run.stageFloor;
  const entered = run.visits[floor];
  const floors = Array.from({ length: APP_LAST_FLOOR }, (_, i) => i + 1);
  const nextLabel = mode === 'undecided' ? t('stageSkip', lang) : t('stageNext', lang);

  return (
    <div className="flex flex-col gap-3" data-testid="floor-header">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold leading-none text-fg" data-testid="stage-floor">
            {floor}
          </span>
          <span className="font-mono text-sm text-fg-3">{t('stageOf', lang)}</span>
          <span className="text-sm text-fg-2">{t(BAND_KEY[bandMode(floor)], lang)}</span>
        </div>
        {entered !== undefined ? <Badge tone="sure">{packName(entered)}</Badge> : modeBadge(mode, lang)}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={prev} disabled={floor <= 1} ariaLabel={t('stagePrev', lang)}>
            <ChevronLeft size={13} aria-hidden />
            {t('stagePrev', lang)}
          </Button>
          {mode !== 'done' ? (
            <Button size="sm" variant={mode === 'undecided' ? 'secondary' : 'primary'} onClick={next} ariaLabel={nextLabel}>
              {mode === 'undecided' ? null : <LogIn size={13} aria-hidden className="rotate-180" />}
              {nextLabel}
              <ChevronRight size={13} aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="flex gap-1" aria-label={t('tabRoutePlan', lang)} data-testid="floor-strip">
        {floors.map((f) => {
          const state = stageModeFor(run, f);
          const planned = shown?.floors.find((entry) => entry.floor === f)?.packId ?? null;
          const shownPack = run.visits[f] ?? (state === 'undecided' ? planned : null);
          const reachable = f <= Math.min(run.currentFloor, APP_LAST_FLOOR);
          const band = bandMode(f);
          return (
            <li key={f} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setStageFloor(f)}
                disabled={!reachable}
                aria-current={f === floor ? 'step' : undefined}
                aria-label={`${t('stageFloor', lang, { floor: f })}${shownPack !== null ? ` · ${packName(shownPack)}` : ''}`}
                title={shownPack !== null ? packName(shownPack) : undefined}
                data-testid="floor-cell"
                data-floor={f}
                data-state={state}
                data-pack={shownPack ?? undefined}
                className={`flex h-9 w-full flex-col items-center justify-center rounded-sm border text-[11px] leading-none transition-colors ${
                  f === floor ? 'border-ink ring-1 ring-ink' : 'border-line'
                } ${state === 'entered' ? 'bg-ink text-ink-fg' : state === 'skipped' ? 'bg-surface-3 text-fg-3' : band === 'extreme' ? 'bg-hatch text-fg-2' : band === 'parallel' ? 'bg-surface-2 text-fg-2' : 'bg-surface text-fg-2'} disabled:cursor-default disabled:opacity-60`}
              >
                <span className="font-mono">{f}</span>
                {shownPack !== null ? <span className="mt-0.5 h-1 w-1 rounded-full bg-current" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
