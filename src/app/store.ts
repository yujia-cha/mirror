import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import lzString from 'lz-string';
import type { PlanOptions } from '../core/types.ts';
import { defaultOptions } from '../core/index.ts';
import type { Lang } from './i18n.ts';
import type { FusionGoalMap, Priority, PriorityMap, RunState } from './lib/plan-input.ts';

export type LeftTab = 'deck' | 'gifts' | 'settings';
export type RightTab = 'plan' | 'tracker';

/** Which side panels are open on a desktop layout, and which tab each shows. Device-only. */
export interface UiState {
  leftOpen: boolean;
  leftTab: LeftTab;
  rightOpen: boolean;
  rightTab: RightTab;
  /** Desktop panel widths in px, dragged by the divider between panel and stage. */
  leftWidth: number;
  rightWidth: number;
}

/** How wide a side panel may be dragged: narrow enough to read, never eating the whole stage. */
export const PANEL_WIDTH = { min: 260, max: 560, default: 336 } as const;

export interface SharedState {
  /** Identity ids in formation order (at most 12, one per sinner). */
  deck: number[];
  /** Who fights, as a subset of `deck`; the order comes from the deck. */
  deployed: number[];
  wanted: number[];
  /** Per-gift priority; gifts absent here are planned as best-effort. */
  priority: PriorityMap;
  options: PlanOptions;
  /** Fusion results whose ingredients are not goals of their own. Absent = ingredients count too. */
  fusionGoal?: FusionGoalMap;
}

interface AppState extends SharedState {
  fusionGoal: FusionGoalMap;
  /** Progress of the run being played. Kept on this device only; never part of a share link. */
  run: RunState;
  ui: UiState;
  lang: Lang;
  dark: boolean;

  /** Fill a sinner's slot; a newcomer is deployed while fewer than `autoDeployUpTo` fight. */
  setDeckSlot: (sinnerId: number, identityId: number | null, autoDeployUpTo?: number) => void;
  setDeck: (deck: number[], deployedDefault: number) => void;
  clearDeck: () => void;
  toggleDeployed: (identityId: number, max: number) => void;
  toggleWanted: (giftId: number, dropWithIt?: number[]) => void;
  removeWanted: (giftId: number) => void;
  clearWanted: () => void;
  /** Pin or unpin a wanted gift for 기프트 관측; at most `max` pins. */
  /** Pin or unpin a wanted gift for 기프트 관측; a pin needs a free slot and an observable gift. */
  toggleObserved: (giftId: number, limits: ObserveLimits) => void;
  /** 반드시 / 보통 / 포기 for a wanted gift. */
  setPriority: (giftId: number, priority: Priority) => void;
  /** Pack-level choices: include somewhere (the planner picks the floor), give up, or neither. */
  preferPack: (packId: number) => void;
  banPack: (packId: number) => void;
  restorePack: (packId: number) => void;
  setFusionGoal: (giftId: number, goal: 'resultOnly' | 'withIngredients') => void;
  /**
   * Record that `packId` was entered on `floor`; a pack is visited once, so an earlier floor for it
   * is replaced. `settle.got` marks gifts collected in the same update (the start-of-run gifts).
   */
  visitPack: (packId: number, floor: number, settle?: { got?: number[] }) => void;
  /** Drop the record; when it was the last decided floor, that floor becomes undecided again. */
  /** Undo an entry; `reset` names gift ids whose recorded status is cleared with it (the pack's own drops). */
  unvisitPack: (packId: number, opts?: { reset?: number[] }) => void;
  /** Leave the stage floor: an undecided floor is skipped; `settle` applies collected / missed gifts first. */
  nextFloor: (settle?: { got?: number[]; failed?: number[] }) => void;
  /** Look back one floor; a skip right before the frontier is taken back so the floor is decided again. */
  setStageFloor: (floor: number) => void;
  resetRun: () => void;
  setGiftStatus: (giftId: number, status: 'got' | 'failed' | null) => void;
  setOptions: (patch: Partial<PlanOptions>) => void;
  resetOptions: () => void;
  setUi: (patch: Partial<UiState>) => void;
  setLang: (lang: Lang) => void;
  toggleDark: () => void;
  applyShared: (shared: SharedState) => void;
}

const SINNER_COUNT = 12;
const LEGACY_DEPLOYED = 6;

/** Identity ids are 1SSNN, so the sinner a slot belongs to is derivable from the id. */
export function sinnerOf(identityId: number): number {
  return Math.floor(identityId / 100) % 100;
}

function prefersDark(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The app always plans the whole run: floors 1-15, which means Hard from floor 1. */
export const APP_LAST_FLOOR = 15;

/** The planner's defaults with the app's fixed floor range applied. */
export function appDefaultOptions(): PlanOptions {
  return { ...defaultOptions(), lastFloor: APP_LAST_FLOOR, hardFromFloor: 1 };
}

/**
 * Keep only the option keys the planner knows, so a link or a saved state from an older version
 * (which carried `giftObservationMax`, or a shorter floor range) cannot smuggle stale keys or a
 * partial run into the plan.
 */
export function sanitizeOptions(raw: unknown): PlanOptions {
  const defaults = appDefaultOptions();
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) if (key in source) out[key] = source[key];
  if ('deployed' in source) out.deployed = source.deployed;
  const observed = Array.isArray(out.observedGifts) ? out.observedGifts : [];
  out.observedGifts = [...new Set(observed.filter((n): n is number => typeof n === 'number'))];
  const ids = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.filter((n): n is number => typeof n === 'number'))] : []);
  const bannedPacks = ids(out.bannedPacks);
  out.bannedPacks = bannedPacks;
  out.preferredPacks = ids(out.preferredPacks).filter((id) => !bannedPacks.includes(id));
  const pins: Record<number, number> = {};
  if (out.pinnedPacks && typeof out.pinnedPacks === 'object') {
    for (const [floor, packId] of Object.entries(out.pinnedPacks as Record<string, unknown>)) {
      if (Number.isInteger(Number(floor)) && typeof packId === 'number') pins[Number(floor)] = packId;
    }
  }
  out.pinnedPacks = pins;
  out.lastFloor = APP_LAST_FLOOR;
  out.hardFromFloor = 1;
  // Run progress lives in the `run` slice, never in shared or saved options.
  out.currentFloor = 1;
  out.ownedGifts = [];
  out.unobtainableGifts = [];
  return out as unknown as PlanOptions;
}

/** Fusion goals only for wanted gifts, with the one non-default value. */
export function sanitizeFusionGoal(raw: unknown, wanted: number[]): FusionGoalMap {
  const out: FusionGoalMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (wanted.includes(id) && value === 'resultOnly') out[id] = value;
  }
  return out;
}

/** What a pin must satisfy: the slot limit and whether the gift can be observed at all. */
export interface ObserveLimits {
  max: number;
  observable: (giftId: number) => boolean;
}

export function emptyRun(): RunState {
  return { currentFloor: 1, stageFloor: 1, visits: {}, giftStatus: {}, startGifts: [] };
}

export function defaultUi(): UiState {
  return { leftOpen: true, leftTab: 'gifts', rightOpen: true, rightTab: 'plan', leftWidth: PANEL_WIDTH.default, rightWidth: PANEL_WIDTH.default };
}

/** A stored or dragged width, rounded and held inside the allowed band. */
export function clampPanelWidth(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : PANEL_WIDTH.default;
  return Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, value));
}

export function sanitizeUi(raw: unknown): UiState {
  const out = defaultUi();
  if (!raw || typeof raw !== 'object') return out;
  const source = raw as Record<string, unknown>;
  if (typeof source.leftOpen === 'boolean') out.leftOpen = source.leftOpen;
  if (typeof source.rightOpen === 'boolean') out.rightOpen = source.rightOpen;
  if (source.leftTab === 'deck' || source.leftTab === 'gifts' || source.leftTab === 'settings') out.leftTab = source.leftTab;
  if (source.rightTab === 'plan' || source.rightTab === 'tracker') out.rightTab = source.rightTab;
  out.leftWidth = clampPanelWidth(source.leftWidth);
  out.rightWidth = clampPanelWidth(source.rightWidth);
  return out;
}

/** The floor after the run: `currentFloor` reaches it once floor 15 is decided. */
export const RUN_DONE_FLOOR = APP_LAST_FLOOR + 1;

/** A saved run, kept only when it still makes sense: integer floors within the run, one floor per pack. */
export function sanitizeRun(raw: unknown): RunState {
  const out = emptyRun();
  if (!raw || typeof raw !== 'object') return out;
  const source = raw as Record<string, unknown>;
  // Before v6 a run had to be started; a saved run that never was carries nothing worth keeping.
  if (source.active === false) return out;
  const seen = new Set<number>();
  if (source.visits && typeof source.visits === 'object') {
    for (const [floor, packId] of Object.entries(source.visits as Record<string, unknown>)) {
      const f = Number(floor);
      if (!Number.isInteger(f) || f < 1 || f > APP_LAST_FLOOR || typeof packId !== 'number' || seen.has(packId)) continue;
      seen.add(packId);
      out.visits[f] = packId;
    }
  }
  if (source.giftStatus && typeof source.giftStatus === 'object') {
    for (const [id, status] of Object.entries(source.giftStatus as Record<string, unknown>)) {
      if (Number.isInteger(Number(id)) && (status === 'got' || status === 'failed')) out.giftStatus[Number(id)] = status;
    }
  }
  const floor = typeof source.currentFloor === 'number' ? Math.round(source.currentFloor) : 1;
  out.currentFloor = Math.min(RUN_DONE_FLOOR, Math.max(1, floor, ...Object.keys(out.visits).map((f) => Number(f) + 1)));
  const stage = typeof source.stageFloor === 'number' ? Math.round(source.stageFloor) : out.currentFloor;
  out.stageFloor = Math.min(APP_LAST_FLOOR, out.currentFloor, Math.max(1, stage));
  // The start-of-run record only means something once floor 1 is behind, and only for gifts
  // still marked as collected.
  if (out.currentFloor > 1 && Array.isArray(source.startGifts)) {
    out.startGifts = [...new Set(source.startGifts.filter((id): id is number => Number.isInteger(id) && out.giftStatus[id as number] === 'got'))];
  }
  return out;
}

/**
 * Builds before M17 recorded the planner's recommended observations as collected on leaving
 * floor 1 and never took that back, so a saved run can carry a "got" ingredient nobody has. Dropping
 * every collected mark on a gift that is no goal makes the planner route for it again (a pack
 * already visited still supplies its own drops through the played floor), at the cost of tracker
 * marks on non-goal gifts, which the player can set again.
 */
export function withoutLegacyGot(giftStatus: RunState['giftStatus'], wanted: number[]): RunState['giftStatus'] {
  const out: RunState['giftStatus'] = {};
  for (const [id, status] of Object.entries(giftStatus)) {
    if (status === 'got' && !wanted.includes(Number(id))) continue;
    out[Number(id)] = status;
  }
  return out;
}

function withoutPack(visits: Record<number, number>, packId: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [f, id] of Object.entries(visits)) if (id !== packId) out[Number(f)] = id;
  return out;
}

/**
 * Move the frontier. Leaving floor 1 is when `settle.got` — the start-of-run gifts — lands in hand
 * and is remembered; coming back to floor 1 takes that record out again (a status the player
 * changed by hand in the meantime is left alone).
 */
function moveFrontier(
  run: RunState,
  currentFloor: number,
  settle?: { got?: number[]; failed?: number[] },
): Pick<RunState, 'currentFloor' | 'giftStatus' | 'startGifts'> {
  let giftStatus = withStatus(run.giftStatus, settle);
  let startGifts = run.startGifts;
  if (run.currentFloor === 1 && currentFloor > 1) {
    startGifts = [...new Set(settle?.got ?? [])];
  } else if (run.currentFloor > 1 && currentFloor === 1) {
    giftStatus = { ...giftStatus };
    for (const id of run.startGifts) if (giftStatus[id] === 'got') delete giftStatus[id];
    startGifts = [];
  }
  return { currentFloor, giftStatus, startGifts };
}

function withStatus(giftStatus: RunState['giftStatus'], settle?: { got?: number[]; failed?: number[] }): RunState['giftStatus'] {
  if (!settle) return giftStatus;
  const next = { ...giftStatus };
  for (const id of settle.got ?? []) next[id] = 'got';
  // A miss never overrides what the player already recorded.
  for (const id of settle.failed ?? []) if (next[id] === undefined) next[id] = 'failed';
  return next;
}

/** Priorities only for the gifts in `wanted`, with the two non-default values. */
export function sanitizePriority(raw: unknown, wanted: number[]): PriorityMap {
  const out: PriorityMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (!wanted.includes(id)) continue;
    if (value === 'must' || value === 'skip') out[id] = value;
  }
  return out;
}

function withoutGift(priority: PriorityMap, giftId: number): PriorityMap {
  if (!(giftId in priority)) return priority;
  const next = { ...priority };
  delete next[giftId];
  return next;
}

/** A pinned observation only makes sense for a wanted gift. */
function withObservedIn(options: PlanOptions, wanted: number[]): PlanOptions {
  const observedGifts = options.observedGifts.filter((id) => wanted.includes(id));
  return observedGifts.length === options.observedGifts.length ? options : { ...options, observedGifts };
}

function uniqueDeck(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    const sinner = sinnerOf(id);
    if (seen.has(sinner)) continue;
    seen.add(sinner);
    out.push(id);
  }
  return out.slice(0, SINNER_COUNT);
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      deck: [],
      deployed: [],
      wanted: [],
      priority: {},
      options: appDefaultOptions(),
      fusionGoal: {},
      run: emptyRun(),
      ui: defaultUi(),
      lang: 'ko',
      dark: prefersDark(),

      setDeckSlot: (sinnerId, identityId, autoDeployUpTo = 0) =>
        set((state) => {
          const index = state.deck.findIndex((id) => sinnerOf(id) === sinnerId);
          const previous = index >= 0 ? state.deck[index]! : null;
          let deck: number[];
          if (identityId === null) deck = state.deck.filter((id) => sinnerOf(id) !== sinnerId);
          else if (index >= 0) deck = state.deck.map((id, i) => (i === index ? identityId : id));
          else deck = [...state.deck, identityId].slice(0, SINNER_COUNT);
          // A replaced identity keeps its deployed seat; a cleared one gives it up.
          let deployed = state.deployed
            .map((id) => (id === previous && identityId !== null ? identityId : id))
            .filter((id) => deck.includes(id));
          if (identityId !== null && previous === null && deployed.length < autoDeployUpTo) {
            deployed = deck.filter((id) => id === identityId || deployed.includes(id));
          }
          return { deck, deployed };
        }),

      setDeck: (deck, deployedDefault) =>
        set(() => {
          const next = uniqueDeck(deck);
          return { deck: next, deployed: next.slice(0, deployedDefault) };
        }),

      clearDeck: () => set({ deck: [], deployed: [] }),

      toggleDeployed: (identityId, max) =>
        set((state) => {
          if (!state.deck.includes(identityId)) return {};
          const has = state.deployed.includes(identityId);
          if (!has && state.deployed.length >= max) return {};
          const deployed = has
            ? state.deployed.filter((id) => id !== identityId)
            : state.deck.filter((id) => id === identityId || state.deployed.includes(id));
          return { deployed };
        }),

      toggleWanted: (giftId, dropWithIt = []) =>
        set((state) => {
          const wanted = state.wanted.includes(giftId)
            ? state.wanted.filter((id) => id !== giftId)
            : [...state.wanted.filter((id) => !dropWithIt.includes(id)), giftId].sort((a, b) => a - b);
          return {
            wanted,
            priority: sanitizePriority(state.priority, wanted),
            fusionGoal: sanitizeFusionGoal(state.fusionGoal, wanted),
            options: withObservedIn(state.options, wanted),
          };
        }),

      removeWanted: (giftId) =>
        set((state) => {
          const wanted = state.wanted.filter((id) => id !== giftId);
          return {
            wanted,
            priority: withoutGift(state.priority, giftId),
            fusionGoal: sanitizeFusionGoal(state.fusionGoal, wanted),
            options: withObservedIn(state.options, wanted),
          };
        }),

      clearWanted: () => set((state) => ({ wanted: [], priority: {}, fusionGoal: {}, options: { ...state.options, observedGifts: [] } })),

      setFusionGoal: (giftId, goal) =>
        set((state) => {
          if (!state.wanted.includes(giftId)) return {};
          const next = { ...state.fusionGoal };
          if (goal === 'resultOnly') next[giftId] = 'resultOnly';
          else delete next[giftId];
          return { fusionGoal: next };
        }),

      visitPack: (packId, floor, settle) =>
        set((state) => {
          if (!Number.isInteger(floor) || floor < 1 || floor > APP_LAST_FLOOR) return {};
          const visits = withoutPack(state.run.visits, packId);
          visits[floor] = packId;
          return {
            run: { ...state.run, visits, ...moveFrontier(state.run, Math.max(state.run.currentFloor, floor + 1), settle) },
          };
        }),
      unvisitPack: (packId, opts) =>
        set((state) => {
          const entry = Object.entries(state.run.visits).find(([, id]) => id === packId);
          if (!entry) return {};
          const floor = Number(entry[0]);
          const visits = withoutPack(state.run.visits, packId);
          // The last decided floor becomes undecided again; an older one turns into a skip.
          const currentFloor = floor === state.run.currentFloor - 1 ? floor : state.run.currentFloor;
          const moved = moveFrontier(state.run, currentFloor);
          const giftStatus = { ...moved.giftStatus };
          for (const id of opts?.reset ?? []) delete giftStatus[id];
          return { run: { ...state.run, visits, ...moved, stageFloor: Math.min(state.run.stageFloor, currentFloor), giftStatus } };
        }),
      nextFloor: (settle) =>
        set((state) => {
          const { run } = state;
          if (run.currentFloor >= RUN_DONE_FLOOR && run.stageFloor >= APP_LAST_FLOOR) return {};
          const skipping = run.stageFloor === run.currentFloor;
          const currentFloor = skipping ? run.currentFloor + 1 : run.currentFloor;
          const stageFloor = Math.min(APP_LAST_FLOOR, run.stageFloor + 1);
          return { run: { ...run, stageFloor, ...moveFrontier(run, currentFloor, settle) } };
        }),
      setStageFloor: (floor) =>
        set((state) => {
          if (!Number.isInteger(floor)) return {};
          const { run } = state;
          const stageFloor = Math.min(APP_LAST_FLOOR, run.currentFloor, Math.max(1, floor));
          // A skip right before the frontier holds no record, so stepping back onto it takes it back.
          const currentFloor = stageFloor === run.currentFloor - 1 && run.visits[stageFloor] === undefined ? stageFloor : run.currentFloor;
          return { run: { ...run, stageFloor, ...moveFrontier(run, currentFloor) } };
        }),
      resetRun: () => set({ run: emptyRun() }),
      setGiftStatus: (giftId, status) =>
        set((state) => {
          const giftStatus = { ...state.run.giftStatus };
          if (status === null) delete giftStatus[giftId];
          else giftStatus[giftId] = status;
          return { run: { ...state.run, giftStatus } };
        }),

      setPriority: (giftId, priority) =>
        set((state) => {
          if (!state.wanted.includes(giftId)) return {};
          const next = priority === 'normal' ? withoutGift(state.priority, giftId) : { ...state.priority, [giftId]: priority };
          // A given-up gift is not planned, so a pinned observation on it would be wasted.
          const options =
            priority === 'skip' && state.options.observedGifts.includes(giftId)
              ? { ...state.options, observedGifts: state.options.observedGifts.filter((id) => id !== giftId) }
              : state.options;
          return { priority: next, options };
        }),

      preferPack: (packId) =>
        set((state) => ({
          options: {
            ...state.options,
            preferredPacks: [...new Set([...state.options.preferredPacks, packId])],
            bannedPacks: state.options.bannedPacks.filter((id) => id !== packId),
          },
        })),
      banPack: (packId) =>
        set((state) => ({
          options: {
            ...state.options,
            bannedPacks: [...new Set([...state.options.bannedPacks, packId])],
            preferredPacks: state.options.preferredPacks.filter((id) => id !== packId),
          },
        })),
      restorePack: (packId) =>
        set((state) => ({
          options: {
            ...state.options,
            bannedPacks: state.options.bannedPacks.filter((id) => id !== packId),
            preferredPacks: state.options.preferredPacks.filter((id) => id !== packId),
          },
        })),

      toggleObserved: (giftId, limits) =>
        set((state) => {
          const has = state.options.observedGifts.includes(giftId);
          if (!has && (state.options.observedGifts.length >= limits.max || !state.wanted.includes(giftId) || !limits.observable(giftId))) return {};
          const observedGifts = has
            ? state.options.observedGifts.filter((id) => id !== giftId)
            : [...state.options.observedGifts, giftId];
          return { options: { ...state.options, observedGifts } };
        }),

      setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
      resetOptions: () => set({ options: appDefaultOptions() }),
      setUi: (patch) => set((state) => ({ ui: sanitizeUi({ ...state.ui, ...patch }) })),
      setLang: (lang) => set({ lang }),
      toggleDark: () => set((state) => ({ dark: !state.dark })),
      // A link is someone's plan, not this device's run: the run record starts over with it.
      applyShared: (shared) =>
        set({
          deck: shared.deck,
          deployed: shared.deployed.filter((id) => shared.deck.includes(id)),
          wanted: shared.wanted,
          priority: sanitizePriority(shared.priority, shared.wanted),
          fusionGoal: sanitizeFusionGoal(shared.fusionGoal, shared.wanted),
          options: sanitizeOptions(shared.options),
          run: emptyRun(),
        }),
    }),
    {
      name: 'md-route-planner',
      version: 7,
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Partial<AppState> & { step?: unknown };
        if (version < 2) {
          const deck = Array.isArray(state.deck) ? state.deck : [];
          state = { ...state, deck, deployed: deck.slice(0, LEGACY_DEPLOYED) };
        }
        // v3 replaced the observation count with pinned observation gifts; v4 fixed the floor
        // range at 15 and added per-gift priorities; v5 added fusion goals and the run in
        // progress; v6 dropped the step flow (the run is always on) and added the panel state;
        // v7 (M17) records the start-of-run gifts so returning to floor 1 takes them back — a run
        // saved by an earlier build may still hold a recommended observation as collected.
        const wanted = Array.isArray(state.wanted) ? state.wanted : [];
        const { step: _step, ...rest } = state;
        void _step;
        const run = sanitizeRun(state.run);
        if (version < 7 && run.currentFloor > 1) run.giftStatus = withoutLegacyGot(run.giftStatus, wanted);
        return {
          ...rest,
          wanted,
          priority: sanitizePriority(state.priority, wanted),
          fusionGoal: sanitizeFusionGoal(state.fusionGoal, wanted),
          run,
          ui: sanitizeUi(state.ui),
          options: sanitizeOptions(state.options),
        } as AppState;
      },
      partialize: (state) => ({
        deck: state.deck,
        deployed: state.deployed,
        wanted: state.wanted,
        priority: state.priority,
        fusionGoal: state.fusionGoal,
        run: state.run,
        ui: state.ui,
        options: state.options,
        lang: state.lang,
        dark: state.dark,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// URL sharing
// ---------------------------------------------------------------------------

const HASH_PREFIX = '#s=';

export function encodeShared(state: SharedState): string {
  const payload = JSON.stringify({
    v: 4,
    deck: state.deck,
    deployed: state.deployed,
    wanted: state.wanted,
    priority: state.priority,
    fusionGoal: state.fusionGoal ?? {},
    options: state.options,
  });
  return HASH_PREFIX + lzString.compressToEncodedURIComponent(payload);
}

export function decodeShared(hash: string): SharedState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const json = lzString.decompressFromEncodedURIComponent(hash.slice(HASH_PREFIX.length));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<SharedState> & { v?: number };
    if (!Array.isArray(parsed.deck) || !Array.isArray(parsed.wanted)) return null;
    const deck = parsed.deck.filter((n): n is number => typeof n === 'number');
    // v1 links carried no deployed list: the first six fought.
    const deployed = Array.isArray(parsed.deployed)
      ? parsed.deployed.filter((n): n is number => typeof n === 'number' && deck.includes(n))
      : deck.slice(0, LEGACY_DEPLOYED);
    const wanted = parsed.wanted.filter((n): n is number => typeof n === 'number');
    return {
      deck,
      deployed,
      wanted,
      priority: sanitizePriority(parsed.priority, wanted),
      fusionGoal: sanitizeFusionGoal(parsed.fusionGoal, wanted),
      options: sanitizeOptions(parsed.options),
    };
  } catch {
    return null;
  }
}
