import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import lzString from 'lz-string';
import type { Keyword } from '../core/schema.ts';
import type { PlanOptions } from '../core/types.ts';
import { defaultOptions } from '../core/index.ts';
import type { Lang } from './i18n.ts';

export interface SharedState {
  deck: number[];
  wanted: number[];
  options: PlanOptions;
}

interface AppState extends SharedState {
  lang: Lang;
  dark: boolean;
  /** Keyword corrections the user makes when the data does not know an identity's keywords. */
  keywordOverrides: Record<number, Keyword[]>;

  setDeckSlot: (sinnerId: number, identityId: number | null) => void;
  setDeck: (deck: number[]) => void;
  clearDeck: () => void;
  toggleWanted: (giftId: number) => void;
  clearWanted: () => void;
  setOptions: (patch: Partial<PlanOptions>) => void;
  setLang: (lang: Lang) => void;
  toggleDark: () => void;
  applyShared: (shared: SharedState) => void;
}

const SINNER_COUNT = 12;

/** Identity ids are 1SSNN, so the sinner a slot belongs to is derivable from the id. */
export function sinnerOf(identityId: number): number {
  return Math.floor(identityId / 100) % 100;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      deck: [],
      wanted: [],
      options: defaultOptions(),
      lang: 'ko',
      dark: true,
      keywordOverrides: {},

      setDeckSlot: (sinnerId, identityId) =>
        set((state) => {
          const withoutSinner = state.deck.filter((id) => sinnerOf(id) !== sinnerId);
          const next = identityId === null ? withoutSinner : [...withoutSinner, identityId];
          // Keep formation order by sinner so "the first six" is predictable.
          return { deck: next.sort((a, b) => sinnerOf(a) - sinnerOf(b) || a - b).slice(0, SINNER_COUNT) };
        }),

      setDeck: (deck) =>
        set({
          deck: [...new Set(deck)].sort((a, b) => sinnerOf(a) - sinnerOf(b) || a - b).slice(0, SINNER_COUNT),
        }),

      clearDeck: () => set({ deck: [] }),

      toggleWanted: (giftId) =>
        set((state) => ({
          wanted: state.wanted.includes(giftId)
            ? state.wanted.filter((id) => id !== giftId)
            : [...state.wanted, giftId].sort((a, b) => a - b),
        })),

      clearWanted: () => set({ wanted: [] }),

      setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
      setLang: (lang) => set({ lang }),
      toggleDark: () => set((state) => ({ dark: !state.dark })),
      applyShared: (shared) =>
        set({
          deck: shared.deck,
          wanted: shared.wanted,
          options: { ...defaultOptions(), ...shared.options },
        }),
    }),
    {
      name: 'md-route-planner',
      version: 1,
      partialize: (state) => ({
        deck: state.deck,
        wanted: state.wanted,
        options: state.options,
        lang: state.lang,
        dark: state.dark,
        keywordOverrides: state.keywordOverrides,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// URL sharing
// ---------------------------------------------------------------------------

const HASH_PREFIX = '#s=';

export function encodeShared(state: SharedState): string {
  const payload = JSON.stringify({ v: 1, deck: state.deck, wanted: state.wanted, options: state.options });
  return HASH_PREFIX + lzString.compressToEncodedURIComponent(payload);
}

export function decodeShared(hash: string): SharedState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const json = lzString.decompressFromEncodedURIComponent(hash.slice(HASH_PREFIX.length));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<SharedState> & { v?: number };
    if (!Array.isArray(parsed.deck) || !Array.isArray(parsed.wanted)) return null;
    return {
      deck: parsed.deck.filter((n): n is number => typeof n === 'number'),
      wanted: parsed.wanted.filter((n): n is number => typeof n === 'number'),
      options: { ...defaultOptions(), ...parsed.options },
    };
  } catch {
    return null;
  }
}
