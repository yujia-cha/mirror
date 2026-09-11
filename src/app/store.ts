import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import lzString from 'lz-string';
import type { PlanOptions } from '../core/types.ts';
import { defaultOptions } from '../core/index.ts';
import type { Lang } from './i18n.ts';
import type { Priority, PriorityMap } from './lib/plan-input.ts';

export type Step = 1 | 2 | 3;

export interface SharedState {
  /** Identity ids in formation order (at most 12, one per sinner). */
  deck: number[];
  /** Who fights, as a subset of `deck`; the order comes from the deck. */
  deployed: number[];
  wanted: number[];
  /** Per-gift priority; gifts absent here are planned as best-effort. */
  priority: PriorityMap;
  options: PlanOptions;
}

interface AppState extends SharedState {
  lang: Lang;
  dark: boolean;
  step: Step;

  /** Fill a sinner's slot; a newcomer is deployed while fewer than `autoDeployUpTo` fight. */
  setDeckSlot: (sinnerId: number, identityId: number | null, autoDeployUpTo?: number) => void;
  setDeck: (deck: number[], deployedDefault: number) => void;
  clearDeck: () => void;
  toggleDeployed: (identityId: number, max: number) => void;
  toggleWanted: (giftId: number, dropWithIt?: number[]) => void;
  removeWanted: (giftId: number) => void;
  clearWanted: () => void;
  /** Pin or unpin a wanted gift for 기프트 관측; at most `max` pins. */
  toggleObserved: (giftId: number, max: number) => void;
  /** 반드시 / 보통 / 포기 for a wanted gift. */
  setPriority: (giftId: number, priority: Priority) => void;
  setOptions: (patch: Partial<PlanOptions>) => void;
  resetOptions: () => void;
  setStep: (step: Step) => void;
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
  out.lastFloor = APP_LAST_FLOOR;
  out.hardFromFloor = 1;
  return out as unknown as PlanOptions;
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
      lang: 'ko',
      dark: prefersDark(),
      step: 1,

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
          return { wanted, priority: sanitizePriority(state.priority, wanted), options: withObservedIn(state.options, wanted) };
        }),

      removeWanted: (giftId) =>
        set((state) => {
          const wanted = state.wanted.filter((id) => id !== giftId);
          return { wanted, priority: withoutGift(state.priority, giftId), options: withObservedIn(state.options, wanted) };
        }),

      clearWanted: () => set((state) => ({ wanted: [], priority: {}, options: { ...state.options, observedGifts: [] } })),

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

      toggleObserved: (giftId, max) =>
        set((state) => {
          const has = state.options.observedGifts.includes(giftId);
          if (!has && (state.options.observedGifts.length >= max || !state.wanted.includes(giftId))) return {};
          const observedGifts = has
            ? state.options.observedGifts.filter((id) => id !== giftId)
            : [...state.options.observedGifts, giftId];
          return { options: { ...state.options, observedGifts } };
        }),

      setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
      resetOptions: () => set({ options: appDefaultOptions() }),
      setStep: (step) => set({ step }),
      setLang: (lang) => set({ lang }),
      toggleDark: () => set((state) => ({ dark: !state.dark })),
      // A recipient lands on the furthest step the link can show: the route when gifts were chosen.
      applyShared: (shared) =>
        set({
          deck: shared.deck,
          deployed: shared.deployed.filter((id) => shared.deck.includes(id)),
          wanted: shared.wanted,
          priority: sanitizePriority(shared.priority, shared.wanted),
          options: sanitizeOptions(shared.options),
          step: shared.deck.length === 0 ? 1 : shared.wanted.length === 0 ? 2 : 3,
        }),
    }),
    {
      name: 'md-route-planner',
      version: 4,
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Partial<AppState>;
        if (version < 2) {
          const deck = Array.isArray(state.deck) ? state.deck : [];
          state = { ...state, deck, deployed: deck.slice(0, LEGACY_DEPLOYED), step: 1 as Step };
        }
        // v3 replaced the observation count with pinned observation gifts; v4 fixed the floor
        // range at 15 and added per-gift priorities.
        const wanted = Array.isArray(state.wanted) ? state.wanted : [];
        return { ...state, wanted, priority: sanitizePriority(state.priority, wanted), options: sanitizeOptions(state.options) } as AppState;
      },
      partialize: (state) => ({
        deck: state.deck,
        deployed: state.deployed,
        wanted: state.wanted,
        priority: state.priority,
        options: state.options,
        lang: state.lang,
        dark: state.dark,
        step: state.step,
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
    v: 3,
    deck: state.deck,
    deployed: state.deployed,
    wanted: state.wanted,
    priority: state.priority,
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
      options: sanitizeOptions(parsed.options),
    };
  } catch {
    return null;
  }
}
