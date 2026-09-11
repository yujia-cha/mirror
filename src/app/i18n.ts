/**
 * UI strings. Korean is the product language; English exists so the page is usable by the
 * English-speaking part of the community and is never the source of truth for a label.
 */
import type { Localized } from '../core/schema.ts';

export type Lang = 'ko' | 'en';

export const STRINGS = {
  appTitle: { ko: '거울 던전 루트 플래너', en: 'Mirror Dungeon Route Planner' },
  appTagline: {
    ko: '덱과 원하는 E.G.O 기프트를 고르면 층별 테마팩 루트를 계산합니다.',
    en: 'Pick a deck and the gifts you want; the planner works out the theme packs per floor.',
  },

  loading: { ko: '게임 데이터를 불러오는 중…', en: 'Loading game data…' },
  loadFailed: { ko: '게임 데이터를 불러오지 못했습니다.', en: 'Could not load the game data.' },
  retry: { ko: '다시 시도', en: 'Retry' },

  tabDeck: { ko: '덱', en: 'Deck' },
  tabGifts: { ko: '기프트', en: 'Gifts' },
  tabRoute: { ko: '루트', en: 'Route' },

  // Deck
  deckHeading: { ko: '덱 편성', en: 'Deck' },
  deckHint: {
    ko: '수감자 칸을 눌러 인격을 고르세요. 앞의 6명이 출격, 나머지는 대기로 계산됩니다.',
    en: 'Tap a sinner slot to choose an identity. The first six count as deployed, the rest as reserves.',
  },
  deckEmptySlot: { ko: '비어 있음', en: 'Empty' },
  deckClear: { ko: '전체 비우기', en: 'Clear all' },
  deckImport: { ko: '편성 코드 가져오기', en: 'Import formation code' },
  deckImportHint: {
    ko: '게임에서 복사한 편성 코드를 붙여넣으세요.',
    en: 'Paste a formation code copied from the game.',
  },
  deckImportApply: { ko: '불러오기', en: 'Import' },
  deckImportFailed: {
    ko: '편성 코드를 읽을 수 없습니다. 코드 전체를 복사했는지 확인하세요.',
    en: 'Could not read that formation code. Check that the whole code was copied.',
  },
  deckImportPartial: {
    ko: '일부 인격을 찾을 수 없어 건너뛰었습니다.',
    en: 'Some identities were not found and were skipped.',
  },
  deckDeployed: { ko: '출격', en: 'Deployed' },
  deckReserve: { ko: '대기', en: 'Reserve' },
  deckSearchPlaceholder: { ko: '인격 이름·소속·키워드 검색', en: 'Search identity, faction or keyword' },
  deckKeywordUnknown: {
    ko: '키워드 미확인 — 조건 판정이 낮게 나올 수 있습니다',
    en: 'Keywords unknown; condition counts may read low',
  },
  deckSummary: { ko: '덱 구성', en: 'Deck makeup' },
  deckNoKeywords: { ko: '키워드 없음', en: 'No keywords' },

  // Gifts
  giftsHeading: { ko: '원하는 기프트', en: 'Wanted gifts' },
  giftsHint: {
    ko: '노리는 기프트를 고르세요. 조합 기프트는 재료까지 자동으로 계산합니다.',
    en: 'Choose what you are after. Fusion results expand into their ingredients automatically.',
  },
  giftsSearchPlaceholder: { ko: '기프트 이름 검색', en: 'Search gift name' },
  giftsSelected: { ko: '선택', en: 'Selected' },
  giftsNone: { ko: '조건에 맞는 기프트가 없습니다.', en: 'No gifts match these filters.' },
  giftsClear: { ko: '선택 비우기', en: 'Clear selection' },
  filterKeyword: { ko: '키워드', en: 'Keyword' },
  filterTier: { ko: '등급', en: 'Tier' },
  filterAcquisition: { ko: '획득', en: 'Source' },
  filterAll: { ko: '전체', en: 'All' },
  filterConditionalOnly: { ko: '조건부만', en: 'Conditional only' },
  filterSelectedOnly: { ko: '선택한 것만', en: 'Selected only' },

  acquisitionGeneral: { ko: '범용', en: 'General' },
  acquisitionPackLimited: { ko: '테마 팩 한정', en: 'Pack-exclusive' },
  acquisitionFusionOnly: { ko: '조합 전용', en: 'Fusion only' },
  acquisitionStartOnly: { ko: '시작 전용', en: 'Start only' },
  acquisitionEvent: { ko: '이벤트', en: 'Event' },
  acquisitionMaterial: { ko: '재료', en: 'Material' },
  acquisitionUnknown: { ko: '경로 불명', en: 'Unknown' },

  tierUnknown: { ko: '등급 미확인', en: 'Tier unknown' },
  hardOnly: { ko: 'Hard 전용', en: 'Hard only' },
  conditionMet: { ko: '조건 충족', en: 'Condition met' },
  conditionUnmet: { ko: '조건 미충족', en: 'Condition not met' },
  fusionRecipe: { ko: '조합', en: 'Fusion' },
  exclusiveTo: { ko: '전용 팩', en: 'Exclusive to' },

  // Options
  optionsHeading: { ko: '계획 옵션', en: 'Options' },
  optionFloors: { ko: '계획 층수', en: 'Floors' },
  optionFloors5: { ko: '1~5층', en: 'Floors 1-5' },
  optionFloors10: { ko: '1~10층 (평행중첩)', en: 'Floors 1-10 (parallel)' },
  optionFloors15: { ko: '1~15층 (EXTREME)', en: 'Floors 1-15 (EXTREME)' },
  optionDifficulty: { ko: '난이도', en: 'Difficulty' },
  optionNormal: { ko: 'Normal', en: 'Normal' },
  optionHard: { ko: 'Hard (1층부터)', en: 'Hard (from floor 1)' },
  optionObservation: { ko: '기프트 관측 최대', en: 'Max observed gifts' },
  optionObservationHint: {
    ko: '루트로 못 덮은 기프트에만 별빛을 씁니다.',
    en: 'Starlight is spent only on gifts the route cannot reach.',
  },
  optionUnvisited: { ko: '미열람 팩 비용 가산', en: 'Assume unvisited packs' },
  optionStartKeyword: { ko: '시작 키워드', en: 'Starting keyword' },
  optionAuto: { ko: '덱에서 자동', en: 'From deck' },

  // Route
  routeHeading: { ko: '루트', en: 'Route' },
  routeEmpty: {
    ko: '원하는 기프트를 고르면 루트가 나옵니다.',
    en: 'Choose some gifts and the route appears here.',
  },
  routeStart: { ko: '시작', en: 'Start' },
  routeStartKeyword: { ko: '키워드', en: 'Keyword' },
  routeStartGift: { ko: '시작 기프트', en: 'Starting gift' },
  routeObserved: { ko: '관측', en: 'Observed' },
  routeStarlight: { ko: '별빛', en: 'Starlight' },
  routeUnverified: { ko: '확인 필요', en: 'Unverified' },
  routeFloor: { ko: '층', en: 'Floor' },
  routeFreeFloor: { ko: '아무 팩이나', en: 'Any pack' },
  routeObservationNeeded: { ko: '관측 필요', en: 'Needs observation' },
  routeObservationImpossible: {
    ko: '관측 불가 — 우연히 등장해야 합니다',
    en: 'Observation unavailable; the pack must appear on its own',
  },
  routeAlternatives: { ko: '대안 팩', en: 'Alternative packs' },
  routePickupExclusive: { ko: '전용', en: 'Exclusive' },
  routePickupPool: { ko: '풀', en: 'Pool' },
  routeIngredientFor: { ko: '재료', en: 'ingredient for' },
  routeFusions: { ko: '조합', en: 'Fusions' },
  routeFusionFrom: { ko: '층 이후 상점·휴식에서', en: 'at a shop or rest node from floor' },
  routeFusionImpossible: { ko: '재료를 모을 수 없음', en: 'Ingredients unavailable' },
  routeGeneralDrops: { ko: '범용 드랍', en: 'General drops' },
  routeGeneralDropsHint: {
    ko: '어느 팩에서나 나올 수 있지만 확정은 아닙니다. 상점과 새로고침을 함께 쓰세요.',
    en: 'These can drop from any pack but are not guaranteed; use the shop and refreshes.',
  },
  routeConditions: { ko: '조건 판정', en: 'Conditions' },
  routeUnresolved: { ko: '미해결', en: 'Unresolved' },
  routeWarnings: { ko: '참고', en: 'Notes' },
  routeSummary: { ko: '요약', en: 'Summary' },
  routeRequiredPacks: { ko: '필요 팩', en: 'Forced packs' },
  routeCovered: { ko: '확보', en: 'Covered' },
  routeCopy: { ko: '텍스트로 복사', en: 'Copy as text' },
  routeCopied: { ko: '복사했습니다', en: 'Copied' },
  share: { ko: '링크 복사', en: 'Copy link' },
  shared: { ko: '링크를 복사했습니다', en: 'Link copied' },

  themeToggle: { ko: '화면 전환', en: 'Toggle theme' },
  langToggle: { ko: 'English', en: '한국어' },
  dataVersion: { ko: '데이터', en: 'Data' },
  aboutData: {
    ko: '게임 데이터와 텍스트의 권리는 Project Moon에 있습니다. 비상업 팬 프로젝트입니다.',
    en: 'Game data and text belong to Project Moon. This is a non-commercial fan project.',
  },
} as const satisfies Record<string, Localized>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

export function pick(value: Localized | undefined, lang: Lang): string {
  if (!value) return '';
  return value[lang] || value.ko || value.en;
}
