import type { Difficulty, Gift, Identity, Keyword, StatusKeyword, ThemePack } from './schema.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface WantedGift {
  giftId: number;
  /** Optional gifts are planned for only when they cost nothing extra. */
  required: boolean;
}

export interface PlanOptions {
  /** How far the run is planned: 5 = one clear, 10 = 평행중첩, 15 = EXTREME. */
  lastFloor: 5 | 10 | 15;
  /**
   * Floor from which packs are entered on Hard. 1 = the whole run is Hard, `null` = all Normal.
   * Hard is sticky in game, so this is a single switch point rather than a per-floor flag.
   * Planning past floor 5 forces 1, because 평행중첩 needs floors 1-5 cleared on Hard.
   */
  hardFromFloor: number | null;
  /** Identity ids deployed (the front 6). Defaults to the first six of the deck. */
  deployed?: number[];
  /** Keyword whose starting-gift pool is used. 'auto' picks the deck's dominant keyword. */
  startKeyword: Keyword | 'auto';
  /** How many extra gifts the starlight-funded 기프트 관측 may grant. */
  giftObservationMax: number;
  /** Assume every forced pack needs an observation on a pack never visited before (×1.5 cost). */
  assumeUnvisitedPacks: boolean;
  /** Floors the user pins to a pack by hand. */
  pinnedPacks: Record<number, number>;
  /** Packs to keep out of the plan. */
  bannedPacks: number[];
}

export interface PlanInput {
  /** Identity ids, at most 12. Order is the formation order. */
  deck: number[];
  wanted: WantedGift[];
  options: PlanOptions;
}

// ---------------------------------------------------------------------------
// Deck analysis
// ---------------------------------------------------------------------------

export interface DeckStats {
  /** Identities whose attack skills inflict each keyword, by counting scope. */
  keywordCounts: Record<'deployed' | 'formation' | 'reserve', Partial<Record<StatusKeyword, number>>>;
  factionCounts: Record<'deployed' | 'formation' | 'reserve', Record<string, number>>;
  deployed: number[];
  reserve: number[];
  unknownIdentities: number[];
  /** Identities whose keywords could not be derived, so counts may be too low. */
  identitiesWithoutKeywords: number[];
}

export interface ConditionReport {
  giftId: number;
  satisfied: boolean;
  /** Tier thresholds beyond the base `min` that the deck also reaches. */
  reachedTiers: number[];
  have: number | null;
  need: number | null;
  detail: { ko: string; en: string };
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type RequirementRoute = 'route' | 'startGift' | 'observation' | 'generalDrop' | 'fusion';

export interface Requirement {
  giftId: number;
  /** Copies needed — a recipe can call for two of the same ingredient. */
  count: number;
  required: boolean;
  /** The fusion result this exists to feed, if any. */
  neededFor: number | null;
  /** How the plan expects to obtain it. Filled in as planning proceeds. */
  via: RequirementRoute;
}

export interface FusionStep {
  result: number;
  ingredients: number[];
  /** Earliest floor at which every ingredient is in hand. */
  earliestFloor: number;
  /** Fusion needs a shop or rest node; true when no floor in range can host it. */
  unreachable: boolean;
  /** More than the shop's fusion slots would be needed in one step. */
  exceedsShopSlots: boolean;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface FloorPlan {
  floor: number;
  mode: Difficulty;
  /** Null means no pack is required here; take whatever the game offers. */
  packId: number | null;
  reason: 'required' | 'pinned' | 'free';
  /** Gifts to pick up on this floor, with why this floor supplies them. */
  pickups: {
    giftId: number;
    kind: 'exclusive' | 'pool';
    /** The fusion this pickup feeds, if it is an ingredient. */
    neededFor: number | null;
  }[];
  /** Observation is the only way to force a specific pack, and EXTREME floors forbid it. */
  observation: { needed: boolean; possible: boolean; starlight: number };
  /** Other packs that could have supplied the same pickups on this floor. */
  alternatives: number[];
}

export type UnresolvedReason =
  | 'no-pack-in-range'
  | 'pack-conflict'
  | 'fusion-ingredient-unresolved'
  | 'not-obtainable'
  | 'hard-only'
  | 'observation-budget';

export interface Unresolved {
  giftId: number;
  reason: UnresolvedReason;
  detail: { ko: string; en: string };
}

export type WarningCode =
  | 'condition-unmet'
  | 'hard-required'
  | 'parallel-requires-hard'
  | 'general-drop-not-guaranteed'
  | 'fusion-late'
  | 'fusion-slots'
  | 'search-capped'
  | 'identity-keywords-unknown'
  | 'gift-observation-unverified';

export interface PlanWarning {
  code: WarningCode;
  detail: { ko: string; en: string };
  giftIds?: number[];
}

export interface RoutePlan {
  start: {
    keyword: Keyword | null;
    /** The one gift taken from the starting keyword pool. */
    startGift: number | null;
    /** Gifts taken through the starlight-funded 기프트 관측. */
    observed: number[];
    starlight: number;
    /** The cost table behind `starlight` is unverified for this season. */
    starlightVerified: boolean;
  };
  floors: FloorPlan[];
  fusions: FusionStep[];
  /** Gifts the plan expects to appear as ordinary drops, which is never guaranteed. */
  generalDrops: number[];
  conditions: ConditionReport[];
  unresolved: Unresolved[];
  warnings: PlanWarning[];
  stats: {
    requiredPacks: number;
    starlight: number;
    coveredWanted: number;
    totalWanted: number;
    searchNodes: number;
    searchCapped: boolean;
    elapsedMs: number;
  };
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

export interface GameIndexes {
  giftById: Map<number, Gift>;
  packById: Map<number, ThemePack>;
  identityById: Map<number, Identity>;
  /** Selectable packs only — unselectable ones can never appear in a run. */
  packs: ThemePack[];
  /** packId list per (mode, floor). */
  packsByFloor: Record<Difficulty, Map<number, number[]>>;
  /** Packs whose pool contains the gift. */
  packsByGift: Map<number, number[]>;
  /** Gifts present in at least `rules.generalGiftPackShare` of packs: not worth routing for. */
  freelyAvailableGifts: Set<number>;
}
