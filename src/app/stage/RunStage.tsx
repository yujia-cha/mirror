/**
 * The run screen in the middle of the shell. The floor on stage is either undecided (choose a
 * pack to enter, or skip), entered (mark the gifts got), skipped (nothing here; a pack can still
 * be recorded), or past the end of the run.
 */
import { useRef } from 'react';
import { Star } from 'lucide-react';
import { t } from '../i18n.ts';
import { useApp } from '../store.ts';
import { enterablePacks, packsOfferedOn } from '../lib/stage.ts';
import { useDragEnter } from '../lib/useDragEnter.ts';
import { PackCard } from '../components/PackCard.tsx';
import { Button, Card, Notice } from '../components/ui.tsx';
import { usePlan } from '../shell/PlanContext.tsx';
import { DragGhost, DropZone, OtherPacks, SkipCard, StagePackCard, type DragId } from './EnterablePacks.tsx';
import { EnteredPack } from './EnteredPack.tsx';
import { FloorHeader } from './FloorHeader.tsx';

export function RunStage({ onOpenGifts }: { onOpenGifts: () => void }) {
  const { indexes, lang, shown, ctx, exclusivesOf, stageMode, enter, next, packName } = usePlan();
  const run = useApp((s) => s.run);
  const resetRun = useApp((s) => s.resetRun);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const floor = run.stageFloor;
  const drop = (id: DragId): void => {
    if (id === 'skip') next();
    else enter(id);
  };
  const { drag, over, handlers } = useDragEnter<DragId>({ onDrop: drop, zoneRef });
  const routePacks = enterablePacks(shown, floor);
  const offered = packsOfferedOn(indexes, floor);
  const entered = run.visits[floor];

  let body;
  if (stageMode === 'done') {
    body = (
      <Card className="flex flex-col items-center gap-2.5 px-4 py-8 text-center" testId="stage-done">
        <div className="text-sm font-semibold">{t('stageDone', lang)}</div>
        <Button variant="secondary" onClick={() => resetRun()}>
          {t('stageNewRun', lang)}
        </Button>
      </Card>
    );
  } else if (stageMode === 'entered' && entered !== undefined) {
    body = <EnteredPack packId={entered} floor={floor} />;
  } else {
    const ghostPack = drag && drag.id !== 'skip' ? indexes.packById.get(drag.id) : undefined;
    body = (
      <div className="flex flex-col gap-3" data-testid="stage-undecided" data-mode={stageMode}>
        {!shown ? (
          <Notice icon={<Star size={14} aria-hidden />}>
            <span className="mr-2">{t('stageNoGoals', lang)}</span>
            <Button size="sm" variant="primary" onClick={onOpenGifts}>
              {t('tabGifts', lang)}
            </Button>
          </Notice>
        ) : null}
        {stageMode === 'skipped' ? <Notice>{t('stageHistoryHint', lang)}</Notice> : null}
        <div className="text-sm font-semibold">{t('stageEnterable', lang)}</div>
        {shown && routePacks.length === 0 && stageMode === 'undecided' ? <p className="text-xs text-fg-3">{t('stageNoRoutePack', lang)}</p> : null}
        <div className="scroll-x -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" data-testid="stage-packs">
          {routePacks.map(({ packId, recommended }) => {
            const pack = indexes.packById.get(packId);
            return pack ? (
              <StagePackCard key={packId} pack={pack} recommended={recommended} ctx={ctx} exclusivesOf={exclusivesOf} handlers={handlers(packId)} dragging={drag?.id === packId} onEnter={enter} />
            ) : null;
          })}
          {stageMode === 'undecided' ? <SkipCard handlers={handlers('skip')} dragging={drag?.id === 'skip'} onSkip={next} lang={lang} /> : null}
        </div>
        <DropZone zoneRef={zoneRef} over={over} active={drag !== null} lang={lang} />
        <OtherPacks offered={offered} exclude={new Set(routePacks.map((p) => p.packId))} ctx={ctx} exclusivesOf={exclusivesOf} onEnter={enter} />
        {drag ? (
          <DragGhost drag={drag} label={t('stageDragging', lang, { name: drag.id === 'skip' ? t('stageSkip', lang) : packName(drag.id) })}>
            {ghostPack ? <PackCard pack={ghostPack} size={48} caption lang={lang} /> : <div className="h-[90px] w-12 rounded-sm border border-dashed border-line-strong" />}
          </DragGhost>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {drag ? t('stageDragging', lang, { name: drag.id === 'skip' ? t('stageSkip', lang) : packName(drag.id) }) : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="run-stage" data-mode={stageMode}>
      <FloorHeader mode={stageMode} />
      {body}
    </div>
  );
}
