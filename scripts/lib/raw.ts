/**
 * Typed readers for the vendored game data under data/raw.
 *
 * Everything here is deliberately tolerant: upstream adds fields between seasons, and files can
 * be absent when the pipeline runs without the static data (`--lenient`).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { localizeList, readJson, repoPath, staticList } from './io.ts';
import type { Sin, StatusKeyword } from '../../src/core/schema.ts';
import { STATUS_KEYWORD_BY_KO } from './derive.ts';

export const STATIC_DIR = repoPath('data/raw/static');
export const LOCALIZE_DIR = repoPath('data/raw/localize');

/** Verified against identity 10101 (참격/우울, 관통/질투, 참격/나태) — see docs/research/mechanics.md. */
export const SIN_BY_COLOR: Record<string, Sin> = {
  CRIMSON: 'WRATH',
  SCARLET: 'LUST',
  AMBER: 'SLOTH',
  SHAMROCK: 'GLUTTONY',
  AZURE: 'GLOOM',
  INDIGO: 'PRIDE',
  VIOLET: 'ENVY',
};

export interface RawThemePack {
  id: number;
  desc?: string;
  exceptionConditions?: { dungeonIdx: number; selectableFloors?: number[] }[];
  egoGiftPool?: number[];
  specificEgoGiftPool?: number[];
  mapGenOption?: { bossPool?: number[] };
  uiConfigs?: { packSpriteId?: string; bossSpriteId?: string };
  unlockCondition?: unknown;
}

export interface RawGift {
  id: number;
  /** Sprite-atlas key when it differs from the gift id. */
  iconId?: number;
  attributeType?: string;
  keyword?: string;
  tag?: string[];
  price?: number;
  lockType?: boolean;
  upgradeDataList?: { upgradeLevel: number; localizeID: number }[] | null;
}

export interface RawPersonality {
  id: number;
  rank?: number;
  season?: number;
  associationList?: string[];
  unitKeywordList?: string[];
  uniqueAttribute?: string;
  attributeList?: { skillId: number; number: number }[];
}

export interface RawSkill {
  id: number;
  skillType?: string;
  skillData?: RawSkillData[];
}

export interface RawSkillData {
  gaksungLevel?: number;
  attributeType?: string;
  atkType?: string;
  defType?: string;
  coinList?: RawCoin[];
}

interface RawCoin {
  abilityScriptList?: { scriptName?: string; buffData?: { buffKeyword?: string } }[];
}

export interface RawCommonData {
  currentDungeonId?: number;
  themePoolNum?: number;
  themePoolRecreateCount?: number;
  selectNewStartEgoGiftCategoryChip?: number;
  starlightInfo?: {
    initPoint?: number;
    detectThemeFloorDefaultPoint?: number;
    detectThemeFloorPointMultiplier?: number;
    detectunentrancedThemeFloorPointMultiplier?: number;
    startBuffEgoGiftRefreshDefaultPoint?: number;
    rewardInfo?: { normalDifficultyBonusMultiplier?: number; hardDifficultyBonusMultiplier?: number };
  };
  egoGiftUpgradeCostTable?: { table?: { tier: number; cost: number[] }[] };
  egoGiftCombineTierTable?: {
    combineScoreByEgoGiftTier?: { egoGiftTier: number; combineScore: number }[];
    combineTierResultByCombineScore?: {
      combineScoreRangeMin: number;
      combineScoreRangeMax: number;
      tierResult: number;
    }[];
  };
  egoGiftCombineFixedTable?: {
    combineFixed?: { resultEgoGiftId: number; requiredEgoGiftIds?: number[] }[];
    combineMixed?: {
      aEgoGiftIds: number[];
      aEgoGiftRequiredNum: number;
      bEgoGiftIds: number[];
      bEgoGiftRequiredNum: number;
      resultEgoGiftId: number;
    }[];
    nonAcquireableInEasyIds?: number[];
  };
  egogiftRandomCombineProbs?: {
    origin?: { materialCount: number; prob: number }[];
    enabledStarlight?: { materialCount: number; prob: number }[];
  };
  startEgoGiftPools?: { keyword: string; normalpool?: number[]; buffpool?: number[] }[];
  pieceEgoGiftIds?: number[];
  /** A random extra battle offered on EXTREME floors; its stages carry the 히든 전투 reward gifts. */
  hiddenBattleInfo?: {
    minFloorCondition?: number;
    pool?: number[];
    probInfo?: { floor: number; prob: number }[];
  };
}

/** A battle stage; `rewardList` is how boss stages hand out 클리어 보상 gifts. */
export interface RawStage {
  id: number;
  stageType?: string;
  rewardList?: { type?: string; rewardId?: number; num?: number; prob?: number }[] | null;
}

/** `mirror-dungeon-egogift-observation-data-*.json`: what 기프트 관측 can offer and what it costs. */
export interface RawObservationData {
  mirrordungeonId: number;
  observationEgoGiftCostDataList?: { egogiftCount: number; starlightCost: number }[];
  observationEgoGiftDataList?: { uiKeyword?: string; egogiftKeyword?: string; egogiftIdList?: number[] }[];
  unobservableEgoGiftIds?: number[];
}

export interface RawDropPool {
  dungeonId: number;
  egoGifts?: number[];
  excludeEgoGifts?: number[];
}

function listFiles(dir: string, match: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => match.test(f))
    .sort()
    .map((f) => join(dir, f));
}

export function staticDataPresent(): boolean {
  return existsSync(join(STATIC_DIR, 'mirrordungeon-theme-floor'));
}

export function readThemePacks(): RawThemePack[] {
  const files = listFiles(join(STATIC_DIR, 'mirrordungeon-theme-floor'), /\.json$/);
  return files.flatMap((f) => staticList<RawThemePack>(readJson(f)));
}

export function readGiftStatics(): RawGift[] {
  const files = listFiles(join(STATIC_DIR, 'ego-gift-mirrordungeon'), /\.json$/);
  return files.flatMap((f) => staticList<RawGift>(readJson(f)));
}

export function readPersonalities(): RawPersonality[] {
  // Newer identities ship in chapter-suffixed files (personality-a1c9p2.json), not just 01-12.
  const files = listFiles(join(STATIC_DIR, 'personality'), /^personality-[\w-]+\.json$/);
  return files.flatMap((f) => staticList<RawPersonality>(readJson(f)));
}

export function readPersonalitySkills(): Map<number, RawSkill> {
  const files = listFiles(join(STATIC_DIR, 'skill'), /^personality-skill-[\w-]+\.json$/);
  const out = new Map<number, RawSkill>();
  for (const f of files) for (const s of staticList<RawSkill>(readJson(f))) out.set(s.id, s);
  return out;
}

/** The newest `mirror-dungeon-common-data-*.json`, which is the live season's rule table. */
export function readCommonData(): { data: RawCommonData; file: string } | null {
  const files = listFiles(join(STATIC_DIR, 'mirror-dungeon-common-data'), /\.json$/);
  if (files.length === 0) return null;
  let best: { data: RawCommonData; file: string } | null = null;
  for (const file of files) {
    const raw = readJson<RawCommonData | { list?: RawCommonData[] }>(file);
    const data = (
      Array.isArray((raw as { list?: RawCommonData[] }).list)
        ? (raw as { list: RawCommonData[] }).list[0]
        : raw
    ) as RawCommonData;
    if (!best || (data.currentDungeonId ?? 0) > (best.data.currentDungeonId ?? 0)) best = { data, file };
  }
  return best;
}

/** Mirror Dungeon battle stages (`battle-mirrordungeon/*.json`), keyed by stage id. */
export function readStages(): Map<number, RawStage> {
  const files = listFiles(join(STATIC_DIR, 'battle-mirrordungeon'), /\.json$/);
  const out = new Map<number, RawStage>();
  for (const f of files) for (const stage of staticList<RawStage>(readJson(f))) out.set(stage.id, stage);
  return out;
}

export function readObservationData(dungeonId: number): RawObservationData | null {
  const files = listFiles(join(STATIC_DIR, 'mirror-dungeon-egogift-observation-data'), /\.json$/);
  for (const f of files) {
    for (const entry of staticList<RawObservationData>(readJson(f))) {
      if (entry.mirrordungeonId === dungeonId) return entry;
    }
  }
  return null;
}

export function readDropPool(dungeonId: number): RawDropPool | null {
  const files = listFiles(join(STATIC_DIR, 'mirrordungeon-egogift-droppool'), /\.json$/);
  for (const f of files) {
    for (const p of staticList<RawDropPool>(readJson(f))) {
      if (p.dungeonId === dungeonId) return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

export type Lang = 'KR' | 'EN';

export interface LocalizedEntry {
  id: number | string;
  name?: string;
  content?: string;
  desc?: string;
  title?: string;
  simpleDesc?: { abilityID: number; simpleDesc: string }[];
}

function localizeFile(lang: Lang, file: string): LocalizedEntry[] {
  const path = join(LOCALIZE_DIR, lang, file);
  if (!existsSync(path)) return [];
  return localizeList<LocalizedEntry>(readJson(path));
}

export function localizeFiles(lang: Lang, match: RegExp): LocalizedEntry[] {
  return listFiles(join(LOCALIZE_DIR, lang), match).flatMap((f) => localizeList<LocalizedEntry>(readJson(f)));
}

export function readGiftTexts(lang: Lang): Map<number, LocalizedEntry> {
  const out = new Map<number, LocalizedEntry>();
  for (const e of localizeFiles(lang, /^EGOgift.*\.json$/)) {
    const id = Number(e.id);
    if (!Number.isFinite(id)) continue;
    // Keep the first definition: base files come before season patches alphabetically, and a
    // later file re-declaring an id is an upgrade variant we look up by localizeID instead.
    if (!out.has(id)) out.set(id, e);
  }
  return out;
}

export function readThemeNames(lang: Lang): Map<number, string> {
  const out = new Map<number, string>();
  for (const e of localizeFiles(lang, /^MirrorDungeonTheme.*\.json$/)) {
    const id = Number(e.id);
    if (Number.isFinite(id) && e.name) out.set(id, e.name);
  }
  return out;
}

export function readPersonalityTexts(lang: Lang): Map<number, LocalizedEntry> {
  const out = new Map<number, LocalizedEntry>();
  for (const e of localizeFile(lang, 'Personalities.json')) {
    const id = Number(e.id);
    if (Number.isFinite(id)) out.set(id, e);
  }
  return out;
}

/** Faction/trait display names, gathered from UnitKeyword*.json and the formation filter list. */
export function readFactionNames(lang: Lang): Map<string, string> {
  const out = new Map<string, string>();
  const add = (rawId: string, value: string | undefined): void => {
    if (!value) return;
    const id = rawId.replace(/^UnitKeyword_/, '').replace(/^formation_name_filter_Etc_/, '');
    if (!out.has(id)) out.set(id, value);
  };
  for (const e of localizeFiles(lang, /^UnitKeyword.*\.json$/)) add(String(e.id), e.content ?? e.name);
  for (const e of localizeFile(lang, 'FormationNameEtcFilter.json')) add(String(e.id), e.content ?? e.name);
  return out;
}

const SPECIAL_VARIANT_LINE = /^-?\s*특수 (화상|출혈|진동|파열|침잠|호흡|충전)\s*$/m;

/**
 * Buff ids the game declares as a 특수 variant of a status keyword, e.g. `ChargeBodyArt`
 * (생체 재료 → 특수 충전) or `NailPersonality` (못 → 특수 출혈).
 *
 * The only machine-readable signal is a bullet in the buff's Korean description that reads
 * exactly 「특수 충전」; buffs that merely *mention* a 특수 variant in a longer sentence are not
 * variants themselves, which is why the line has to stand alone.
 */
export function readSpecialVariants(): Map<string, StatusKeyword> {
  const out = new Map<string, StatusKeyword>();
  for (const e of localizeFile('KR', 'BattleKeywords.json')) {
    const m = typeof e.desc === 'string' ? SPECIAL_VARIANT_LINE.exec(e.desc) : null;
    const keyword = m ? STATUS_KEYWORD_BY_KO[m[1]!] : undefined;
    if (keyword) out.set(String(e.id), keyword);
  }
  return out;
}

export function readGiftCategoryNames(lang: Lang): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of localizeFile(lang, 'EgoGiftCategory.json')) {
    if (e.name) out.set(String(e.id), e.name);
  }
  return out;
}

export function readLockedDescs(): Map<number, string> {
  const out = new Map<number, string>();
  for (const e of localizeFile('KR', 'MirrorDungeonEgoGiftLockedDesc.json')) {
    const id = Number(e.id);
    if (Number.isFinite(id) && e.content) out.set(id, e.content);
  }
  return out;
}
