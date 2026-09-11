import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import lzString from 'lz-string';
import type { PlanOptions } from '../core/types.ts';
import { defaultOptions } from '../core/index.ts';
import type { Lang } from './i18n.ts';

export type Step = 1 | 2 | 3;

export interface SharedState {
  /** Identity ids in formation order (at most 12, one per sinner). */
  deck: number[];
  /** Who fights, as a subset of `deck`; the order comes from the deck. */
  deployed: number[];
  wanted: number[];
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
      options: defaultOptions(),
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
        set((state) => ({
          wanted: state.wanted.includes(giftId)
            ? state.wanted.filter((id) => id !== giftId)
            : [...state.wanted.filter((id) => !dropWithIt.includes(id)), giftId].sort((a, b) => a - b),
        })),

      removeWanted: (giftId) => set((state) => ({ wanted: state.wanted.filter((id) => id !== giftId) })),

      clearWanted: () => set({ wanted: [] }),

      setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
      resetOptions: () => set({ options: defaultOptions() }),
      setStep: (step) => set({ step }),
      setLang: (lang) => set({ lang }),
      toggleDark: () => set((state) => ({ dark: !state.dark })),
      applyShared: (shared) =>
        set({
          deck: shared.deck,
          deployed: shared.deployed.filter((id) => shared.deck.includes(id)),
          wanted: shared.wanted,
          options: { ...defaultOptions(), ...shared.options },
        }),
    }),
    {
      name: 'md-route-planner',
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<AppState>;
        if (version < 2) {
          const deck = Array.isArray(state.deck) ? state.deck : [];
          return { ...state, deck, deployed: deck.slice(0, LEGACY_DEPLOYED), step: 1 as Step } as AppState;
        }
        return state as AppState;
      },
      partialize: (state) => ({
        deck: state.deck,
        deployed: state.deployed,
        wanted: state.wanted,
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
    v: 2,
    deck: state.deck,
    deployed: state.deployed,
    wanted: state.wanted,
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
    return {
      deck,
      deployed,
      wanted: parsed.wanted.filter((n): n is number => typeof n === 'number'),
      options: { ...defaultOptions(), ...parsed.options },
    };
  } catch {
    return null;
  }
}
