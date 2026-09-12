/**
 * One plan for the whole shell. The route is computed once from the store (goals, deck, options
 * and the run record) and handed to the stage and both side panels, together with the pack
 * context every pack surface takes and the run actions that settle gifts as floors are left.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameData, Keyword } from '../../core/schema.ts';
import { observable, planAlternatives, planRoute } from '../../core/index.ts';
import type { DeckStats, GameIndexes, PlanInput, RoutePlan } from '../../core/types.ts';
import type { RouteVariant } from '../../core/index.ts';
import { pick, type Lang } from '../i18n.ts';
import { useApp } from '../store.ts';
import { keywordName } from '../format.ts';
import { conditionText } from '../condition-text.ts';
import { judgementsByGift, type Judgement } from '../lib/judgement.ts';
import { planInputFor, priorityOf, skippedGifts } from '../lib/plan-input.ts';
import { autoFailedFor, exclusivesIndex, stageModeFor, type StageMode } from '../lib/stage.ts';
import type { PackContext } from '../components/PackSheet.tsx';

export interface PlanState {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
  input: PlanInput;
  /** The plan for the full goal list, or null without goals. */
  plan: RoutePlan | null;
  /** The plan on display: the selected alternative, or `plan`. */
  shown: RoutePlan | null;
  variants: RouteVariant[];
  variantIndex: number;
  setVariantIndex: (index: number) => void;
  variant: RouteVariant | undefined;
  skipped: number[];
  /** Goal gifts the planner works for (given-up ones excluded). */
  goals: ReadonlySet<number>;
  judgements: Map<number, Judgement | null>;
  giftTitle: (id: number) => string | undefined;
  giftName: (id: number) => string;
  packName: (id: number) => string;
  keywordLabel: (id: Keyword) => string;
  ctx: PackContext;
  exclusivesOf: (packId: number) => number[];
  /** What the run starts with: the observed gifts and the starting gift, collected on leaving floor 1. */
  startGifts: number[];
  stageMode: StageMode;
  /** Enter a pack on the stage floor. */
  enter: (packId: number) => void;
  /** Leave the stage floor: an undecided floor is skipped, an entered pack's unmarked goals are missed. */
  next: () => void;
  prev: () => void;
}

const PlanCtx = createContext<PlanState | null>(null);

export function usePlan(): PlanState {
  const value = useContext(PlanCtx);
  if (!value) throw new Error('usePlan needs a PlanProvider');
  return value;
}

export function PlanProvider({ data, indexes, stats, lang, children }: { data: GameData; indexes: GameIndexes; stats: DeckStats; lang: Lang; children: ReactNode }) {
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const wanted = useApp((s) => s.wanted);
  const priority = useApp((s) => s.priority);
  const options = useApp((s) => s.options);
  const fusionGoal = useApp((s) => s.fusionGoal);
  const run = useApp((s) => s.run);
  const preferPack = useApp((s) => s.preferPack);
  const banPack = useApp((s) => s.banPack);
  const restorePack = useApp((s) => s.restorePack);
  const toggleObserved = useApp((s) => s.toggleObserved);
  const toggleWanted = useApp((s) => s.toggleWanted);
  const visitPack = useApp((s) => s.visitPack);
  const unvisitPack = useApp((s) => s.unvisitPack);
  const setGiftStatus = useApp((s) => s.setGiftStatus);
  const nextFloor = useApp((s) => s.nextFloor);
  const prevFloor = useApp((s) => s.prevFloor);
  const [variantIndex, setVariantIndex] = useState(0);

  const input = useMemo(
    () => planInputFor({ deck, deployed, wanted, priority, options, fusionGoal, run }),
    [deck, deployed, wanted, priority, options, fusionGoal, run],
  );
  const plan = useMemo(() => (input.wanted.length === 0 ? null : planRoute(input, data, indexes)), [input, data, indexes]);
  const variants = useMemo(
    () => (plan && plan.unresolved.some((u) => u.reason === 'pack-conflict') ? planAlternatives(input, data, indexes, plan) : []),
    [plan, input, data, indexes],
  );
  useEffect(() => setVariantIndex(0), [input]);
  const variant = variantIndex > 0 ? variants[variantIndex - 1] : undefined;
  const shown = variant?.plan ?? plan;
  const exclusivesOf = useMemo(() => exclusivesIndex(data, indexes), [data, indexes]);

  const value = useMemo<PlanState>(() => {
    const giftName = (id: number): string => pick(indexes.giftById.get(id)?.name, lang);
    const packName = (id: number): string => pick(indexes.packById.get(id)?.name, lang);
    const keywordLabel = (id: Keyword): string => keywordName(id, data.enums, lang);
    const judgements = judgementsByGift(shown?.conditions ?? []);
    const giftTitle = (id: number): string | undefined => {
      const reports = (shown?.conditions ?? []).filter((c) => c.giftId === id);
      return reports.length > 0 ? reports.map((r) => conditionText(r, data.enums, lang)).join(' / ') : undefined;
    };
    const goals = new Set(input.wanted.map((w) => w.giftId));
    const startGifts = plan ? [...plan.start.observed.map((o) => o.giftId), ...(plan.start.startGift ? [plan.start.startGift] : [])] : [];
    // Leaving floor 1 for the first time is when the start-of-run gifts land in hand.
    const startSettle = run.currentFloor === 1 ? startGifts : [];
    const enter = (packId: number): void => visitPack(packId, run.stageFloor, { got: startSettle });
    const next = (): void => {
      const entered = run.visits[run.stageFloor];
      const failed = entered !== undefined ? autoFailedFor(entered, goals, run.giftStatus, exclusivesOf) : [];
      nextFloor({ got: startSettle, failed });
    };
    const ctx: PackContext = {
      indexes,
      judgements,
      giftTitle,
      giftName,
      packName,
      isMust: (id) => priorityOf(priority, id) === 'must',
      observable: (id) => {
        const gift = indexes.giftById.get(id);
        return gift ? observable(gift, data.rules) : false;
      },
      observed: new Set((shown?.start.observed ?? []).filter((o) => o.pinned).map((o) => o.giftId)),
      wanted: goals,
      preferred: new Set(options.preferredPacks),
      banned: new Set(options.bannedPacks),
      assignedAt: (packId) => shown?.floors.find((f) => f.packId === packId && f.reason !== 'free')?.floor ?? null,
      onPrefer: variant ? undefined : preferPack,
      onBan: variant ? undefined : banPack,
      onRestore: variant ? undefined : restorePack,
      onToggleObserved: variant ? undefined : (giftId) => toggleObserved(giftId, data.rules.giftObservation.max),
      onToggleWanted: variant ? undefined : (giftId) => toggleWanted(giftId),
      run: {
        currentFloor: run.currentFloor,
        stageFloor: run.stageFloor,
        visitedAt: (packId) => {
          const entry = Object.entries(run.visits).find(([, id]) => id === packId);
          return entry ? Number(entry[0]) : null;
        },
        giftStatus: (giftId) => run.giftStatus[giftId] ?? null,
        onEnter: variant ? undefined : enter,
        onUnvisit: unvisitPack,
        onGiftStatus: setGiftStatus,
      },
      lang,
    };
    return {
      data,
      indexes,
      stats,
      lang,
      input,
      plan,
      shown,
      variants,
      variantIndex,
      setVariantIndex,
      variant,
      skipped: skippedGifts(wanted, priority),
      goals,
      judgements,
      giftTitle,
      giftName,
      packName,
      keywordLabel,
      ctx,
      exclusivesOf,
      startGifts,
      stageMode: stageModeFor(run, run.stageFloor),
      enter,
      next,
      prev: prevFloor,
    };
  }, [
    data,
    indexes,
    stats,
    lang,
    input,
    plan,
    shown,
    variants,
    variantIndex,
    variant,
    wanted,
    priority,
    options,
    run,
    exclusivesOf,
    preferPack,
    banPack,
    restorePack,
    toggleObserved,
    toggleWanted,
    visitPack,
    unvisitPack,
    setGiftStatus,
    nextFloor,
    prevFloor,
  ]);

  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}
