/**
 * data/raw + data/curated  ->  public/data/*.json
 *
 *   npm run data:build
 *   npm run data:build -- --lenient   tolerate missing static data (names only, tiers null)
 *
 * Output is deterministic: object keys are sorted on write and every array is sorted explicitly,
 * so regenerating without an input change produces no diff. CI enforces that.
 */
import { createHash } from 'node:crypto';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasFlag, readJson, readJsonIfExists, repoPath, writeJsonStable } from './lib/io.ts';
import {
  SIN_BY_COLOR,
  readCommonData,
  readDropPool,
  readFactionNames,
  readGiftCategoryNames,
  readGiftStatics,
  readGiftTexts,
  readLockedDescs,
  readPersonalities,
  readPersonalitySkills,
  readPersonalityTexts,
  readThemeNames,
  readThemePacks,
  staticDataPresent,
  LOCALIZE_DIR,
  STATIC_DIR,
} from './lib/raw.ts';
import {
  affinitiesFromDevName,
  availabilityFor,
  cleanFactionName,
  deriveIdentityKeywords,
  groupForPackId,
  sinnerIdFromIdentityId,
  tierFromTags,
  deriveUpgradeOf,
} from './lib/derive.ts';
import { parseConditions } from './lib/parse-conditions.ts';
import {
  KEYWORDS,
  STATUS_KEYWORDS,
  SINS,
  type AcquisitionKind,
  type Condition,
  type Enums,
  type Gift,
  type Identity,
  type Localized,
  type Meta,
  type Rules,
  type ThemePack,
} from '../src/core/schema.ts';

const OUT = repoPath('public/data');
const lenient = hasFlag('--lenient');

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

function loc(ko: string | undefined, en: string | undefined): Localized {
  return { ko: (ko ?? '').trim(), en: (en ?? '').trim() };
}

function sortNums(xs: Iterable<number>): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Curated overrides
// ---------------------------------------------------------------------------

interface CuratedRules {
  deployment?: Rules['deployment'];
  giftObservation?: Rules['giftObservation'];
  generalGiftPackShare?: number;
  hiddenPack?: Rules['hiddenPack'];
  [key: string]: unknown;
}

const curated = {
  rules: readJsonIfExists<CuratedRules>(repoPath('data/curated/rules.json')) ?? {},
  factions:
    readJsonIfExists<Record<string, { ko?: string; en?: string }>>(repoPath('data/curated/factions.json')) ??
    {},
  identityKeywords:
    readJsonIfExists<Record<string, { keywords?: Record<string, { skills: number; special: boolean }> }>>(
      repoPath('data/curated/identity-keywords.json'),
    ) ?? {},
  conditions:
    readJsonIfExists<Record<string, { conditions?: Condition[] }>>(
      repoPath('data/curated/conditions.json'),
    ) ?? {},
  names:
    readJsonIfExists<{
      gifts?: Record<string, Partial<Localized>>;
      packs?: Record<string, Partial<Localized>>;
      identities?: Record<string, Partial<Localized>>;
    }>(repoPath('data/curated/names-override.json')) ?? {},
  notes:
    readJsonIfExists<{ gifts?: Record<string, Localized>; packs?: Record<string, Localized> }>(
      repoPath('data/curated/notes.json'),
    ) ?? {},
};

/** Curated files use `_`-prefixed keys for comments and examples; they are never data. */
function curatedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).filter(([key]) => !key.startsWith('_'));
}

function applyNameOverride(base: Localized, override: Partial<Localized> | undefined): Localized {
  if (!override) return base;
  return { ko: override.ko ?? base.ko, en: override.en ?? base.en };
}

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------

const hasStatic = staticDataPresent();
if (!hasStatic && !lenient) {
  fail('data/raw/static is missing. Run `npm run data:fetch`, or pass --lenient to build names only.');
}

const common = readCommonData();
if (!common && !lenient) fail('mirror-dungeon-common-data is missing from data/raw/static.');

const dungeonId = common?.data.currentDungeonId ?? 7;
const combineTable = common?.data.egoGiftCombineFixedTable ?? {};
const hardOnlyIds = new Set(combineTable.nonAcquireableInEasyIds ?? []);
const dropPool = readDropPool(dungeonId);

const rawPacks = readThemePacks();
const rawGifts = readGiftStatics();
const rawPersonalities = readPersonalities();
const skills = readPersonalitySkills();

const giftTextKo = readGiftTexts('KR');
const giftTextEn = readGiftTexts('EN');
const themeNameKo = readThemeNames('KR');
const themeNameEn = readThemeNames('EN');
const personalityKo = readPersonalityTexts('KR');
const personalityEn = readPersonalityTexts('EN');
const factionKo = readFactionNames('KR');
const factionEn = readFactionNames('EN');
const categoryKo = readGiftCategoryNames('KR');
const categoryEn = readGiftCategoryNames('EN');
const lockedDesc = readLockedDescs();

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

const factionIds = new Set<string>();
for (const p of rawPersonalities) for (const id of p.associationList ?? []) factionIds.add(id);
for (const [id] of curatedEntries(curated.factions)) factionIds.add(id);

const factionNameById = new Map<string, Localized>();
const factionDeprecated = new Set<string>();
const unnamedFactions: string[] = [];

for (const id of [...factionIds].sort()) {
  const override = curated.factions[id];
  const rawKo = factionKo.get(id);
  const rawEn = factionEn.get(id);
  const ko = override?.ko ?? (rawKo ? cleanFactionName(rawKo).name : '');
  const en = override?.en ?? (rawEn ? cleanFactionName(rawEn).name : '');
  if (rawKo && cleanFactionName(rawKo).deprecated) factionDeprecated.add(id);
  if (!ko) unnamedFactions.push(id);
  factionNameById.set(id, { ko: ko || id, en: en || ko || id });
}

/** Korean display name -> faction id, for the condition parser. Longest names win on collision. */
const factionIdByName = new Map<string, string>();
for (const [id, name] of [...factionNameById].sort((a, b) => b[1].ko.length - a[1].ko.length)) {
  if (name.ko && !factionIdByName.has(name.ko)) factionIdByName.set(name.ko, id);
}
// Trait-only names (엄지, 거미집 …) also appear in condition text, so accept them too.
for (const [id, raw] of factionKo) {
  const { name } = cleanFactionName(raw);
  if (name && !factionIdByName.has(name)) factionIdByName.set(name, id);
}

// ---------------------------------------------------------------------------
// Theme packs
// ---------------------------------------------------------------------------

const packs: ThemePack[] = rawPacks
  .map((raw): ThemePack => {
    const devName = (raw.desc ?? '').trim();
    const availability = availabilityFor(raw);
    const exclusives = sortNums(raw.specificEgoGiftPool ?? []);
    const affinity = affinitiesFromDevName(devName);
    const group = groupForPackId(raw.id);
    const notes = curated.notes.packs?.[String(raw.id)];
    return {
      id: raw.id,
      name: applyNameOverride(
        loc(themeNameKo.get(raw.id) ?? devName, themeNameEn.get(raw.id) ?? devName),
        curated.names.packs?.[String(raw.id)],
      ),
      devName,
      group,
      availability,
      selectable: Object.values(availability).some((floors) => floors.length > 0),
      // The in-game pool is the union: `specificEgoGiftPool` entries are not repeated in `egoGiftPool`.
      giftPool: sortNums([...(raw.egoGiftPool ?? []), ...exclusives]),
      exclusiveGifts: exclusives,
      keywordAffinity: group === 'keyword' ? affinity.keyword : null,
      sinAffinity: group === 'sin' ? affinity.sin : null,
      attackTypeAffinity: group === 'attackType' ? affinity.attackType : null,
      bossIds: sortNums(raw.mapGenOption?.bossPool ?? []),
      ...(notes ? { notes } : {}),
    };
  })
  .sort((a, b) => a.id - b.id);

const selectablePacks = packs.filter((p) => p.selectable);

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

const packsByGift = new Map<number, number[]>();
const exclusiveByGift = new Map<number, number[]>();
for (const pack of selectablePacks) {
  for (const giftId of pack.giftPool) {
    const list = packsByGift.get(giftId) ?? [];
    list.push(pack.id);
    packsByGift.set(giftId, list);
  }
  for (const giftId of pack.exclusiveGifts) {
    const list = exclusiveByGift.get(giftId) ?? [];
    list.push(pack.id);
    exclusiveByGift.set(giftId, list);
  }
}

/** Fixed recipes, keyed by result. `requiredEgoGiftIds` is the real ingredient list. */
const recipesByResult = new Map<number, number[][]>();
for (const entry of combineTable.combineFixed ?? []) {
  const ingredients = [...(entry.requiredEgoGiftIds ?? [])].sort((a, b) => a - b);
  if (ingredients.length < 2) continue;
  const list = recipesByResult.get(entry.resultEgoGiftId) ?? [];
  if (!list.some((existing) => existing.join(',') === ingredients.join(','))) list.push(ingredients);
  recipesByResult.set(entry.resultEgoGiftId, list);
}

const mixedByResult = new Map<number, Gift['fusion']>();
for (const entry of combineTable.combineMixed ?? []) {
  mixedByResult.set(entry.resultEgoGiftId, {
    recipes: [],
    mixed: {
      aPool: sortNums(entry.aEgoGiftIds),
      aCount: entry.aEgoGiftRequiredNum,
      bPool: sortNums(entry.bEgoGiftIds),
      bCount: entry.bEgoGiftRequiredNum,
    },
  });
}

const startKeywordByGift = new Map<number, string>();
for (const pool of common?.data.startEgoGiftPools ?? []) {
  for (const giftId of [...(pool.normalpool ?? []), ...(pool.buffpool ?? [])]) {
    if (!startKeywordByGift.has(giftId)) startKeywordByGift.set(giftId, pool.keyword);
  }
}

/**
 * Everything the season can hand out. `excludeEgoGifts` does NOT mean unobtainable — it removes a
 * gift from the *generic* reward roll because it has its own path (pack-exclusive, fusion, or a
 * specific choice event), so the two sets are tracked separately.
 */
const dropPoolIds = new Set(dropPool?.egoGifts ?? []);
const materialIds = new Set(common?.data.pieceEgoGiftIds ?? []);

/** Gifts the game itself describes as shop-fusion-only, a cross-check on the recipe table. */
const fusionOnlyByLockedDesc = new Set(
  [...lockedDesc].filter(([, text]) => text.includes('합성')).map(([id]) => id),
);

const giftStaticById = new Map<number, (typeof rawGifts)[number]>();
for (const g of rawGifts) if (!giftStaticById.has(g.id)) giftStaticById.set(g.id, g);

/** Every gift the Mirror Dungeon can present this season, from any angle. */
const giftIds = new Set<number>([
  ...dropPoolIds,
  ...packsByGift.keys(),
  ...exclusiveByGift.keys(),
  ...recipesByResult.keys(),
  ...mixedByResult.keys(),
  ...startKeywordByGift.keys(),
  ...hardOnlyIds,
  ...(common?.data.pieceEgoGiftIds ?? []),
]);
for (const recipe of recipesByResult.values()) {
  for (const ingredients of recipe) for (const id of ingredients) giftIds.add(id);
}
for (const fusion of mixedByResult.values()) {
  for (const id of [...(fusion?.mixed?.aPool ?? []), ...(fusion?.mixed?.bPool ?? [])]) giftIds.add(id);
}

const generalShare = curated.rules.generalGiftPackShare ?? 0.6;

const missingText: number[] = [];
let unparsedConditionCount = 0;

const gifts: Gift[] = [...giftIds]
  .sort((a, b) => a - b)
  .map((id): Gift => {
    const stat = giftStaticById.get(id);
    const ko = giftTextKo.get(id);
    const en = giftTextEn.get(id);
    if (!ko) missingText.push(id);

    const tags = [...(stat?.tag ?? [])].sort();
    const packList = sortNums(packsByGift.get(id) ?? []);
    const exclusiveList = sortNums(exclusiveByGift.get(id) ?? []);
    const recipes = recipesByResult.get(id) ?? [];
    const mixed = mixedByResult.get(id);

    /**
     * The game's own taxonomy: a gift listed in some pack's `specificEgoGiftPool` is 테마 팩 한정,
     * anything else that drops from pack pools is a general drop, and a fixed-recipe result is
     * fusion-only (those never appear in a pool). The planner decides how hard a general gift is
     * to get from `acquisition.packs.length`, not from this label.
     */
    let kind: AcquisitionKind;
    if (exclusiveList.length > 0) kind = 'packLimited';
    else if (packList.length > 0) kind = 'general';
    else if (recipes.length > 0 || mixed) kind = 'fusionOnly';
    // The game's own "획득 조건: 상점 「E.G.O 기프트 합성」" text catches fusion results whose
    // recipe we failed to read.
    else if (fusionOnlyByLockedDesc.has(id)) kind = 'fusionOnly';
    else if (startKeywordByGift.has(id)) kind = 'startOnly';
    else if (materialIds.has(id)) kind = 'material';
    else if (dropPoolIds.has(id)) kind = 'event';
    else kind = 'unknown';

    const desc = loc(ko?.desc, en?.desc);
    const curatedCondition = curated.conditions[String(id)];
    let conditions: Condition[];
    if (curatedCondition?.conditions) {
      conditions = curatedCondition.conditions;
    } else {
      const parsed = parseConditions(desc, { factionIdByName });
      conditions = parsed.conditions;
      unparsedConditionCount += parsed.unparsedCount;
    }

    const startKeyword = startKeywordByGift.get(id);
    const notes = curated.notes.gifts?.[String(id)];
    const rawKeyword = stat?.keyword;
    const keyword = (KEYWORDS as readonly string[]).includes(rawKeyword ?? '')
      ? (rawKeyword as Gift['keyword'])
      : 'None';

    return {
      id,
      name: applyNameOverride(loc(ko?.name, en?.name ?? ko?.name), curated.names.gifts?.[String(id)]),
      desc,
      keyword,
      tier: stat ? tierFromTags(tags) : null,
      sin: stat?.attributeType ? (SIN_BY_COLOR[stat.attributeType] ?? null) : null,
      price: typeof stat?.price === 'number' ? stat.price : null,
      upgradeLevels: Math.min(2, Math.max(0, (stat?.upgradeDataList?.length ?? 1) - 1)) as 0 | 1 | 2,
      tags,
      hardOnly: hardOnlyIds.has(id),
      obtainable: dropPoolIds.has(id) || materialIds.has(id) || recipes.length > 0 || Boolean(mixed),
      acquisition: {
        kind,
        packs: packList,
        exclusiveTo: exclusiveList,
        startKeyword:
          startKeyword && (KEYWORDS as readonly string[]).includes(startKeyword)
            ? (startKeyword as Gift['keyword'])
            : null,
      },
      fusion:
        recipes.length > 0 || mixed
          ? {
              recipes: recipes
                .map((ingredients) => ({ ingredients }))
                .sort(
                  (a, b) =>
                    a.ingredients.length - b.ingredients.length || a.ingredients[0]! - b.ingredients[0]!,
                ),
              ...(mixed?.mixed ? { mixed: mixed.mixed } : {}),
            }
          : null,
      conditions,
      upgradeOf: null,
      ...(notes ? { notes } : {}),
    };
  });

// 조합 계승: a lower-tier ingredient that feeds exactly one same-keyword result points at it.
const upgradeOfById = deriveUpgradeOf(
  recipesByResult,
  new Map(gifts.map((g) => [g.id, { keyword: g.keyword, tier: g.tier }])),
);
for (const gift of gifts) gift.upgradeOf = upgradeOfById.get(gift.id) ?? null;

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

const SINNER_NAMES: Localized[] = [];
for (let sinner = 1; sinner <= 12; sinner += 1) {
  const baseId = 10000 + sinner * 100 + 1;
  SINNER_NAMES[sinner] = loc(personalityKo.get(baseId)?.name, personalityEn.get(baseId)?.name);
}

const identities: Identity[] = rawPersonalities
  .map((raw): Identity => {
    const sinnerId = sinnerIdFromIdentityId(raw.id);
    const curatedKeywords = curated.identityKeywords[String(raw.id)]?.keywords;
    const derived = deriveIdentityKeywords(raw, skills);
    const keywords = (curatedKeywords ?? derived) as Identity['keywords'];
    const keywordSource: Identity['keywordSource'] = curatedKeywords
      ? 'curated'
      : Object.keys(derived).length > 0
        ? 'derived'
        : 'none';

    const sins = new Set<Identity['sins'][number]>();
    const attackTypes = new Set<Identity['attackTypes'][number]>();
    for (const entry of raw.attributeList ?? []) {
      const data = skills.get(entry.skillId)?.skillData?.[0];
      const sin = data?.attributeType ? SIN_BY_COLOR[data.attributeType] : undefined;
      if (sin) sins.add(sin);
      switch (data?.atkType) {
        case 'SLASH':
          attackTypes.add('Slash');
          break;
        case 'PENETRATE':
          attackTypes.add('Penetrate');
          break;
        case 'HIT':
          attackTypes.add('Hit');
          break;
        default:
          break;
      }
    }

    const title = loc(
      personalityKo.get(raw.id)?.title?.replace(/\s*\n\s*/g, ' '),
      personalityEn.get(raw.id)?.title?.replace(/\s*\n\s*/g, ' '),
    );

    return {
      id: raw.id,
      sinnerId,
      sinner: SINNER_NAMES[sinnerId] ?? loc('', ''),
      title: applyNameOverride(title, curated.names.identities?.[String(raw.id)]),
      rank: Math.min(3, Math.max(1, raw.rank ?? 1)) as 1 | 2 | 3,
      season: raw.season ?? 0,
      factions: [...(raw.associationList ?? [])].sort(),
      traits: [...(raw.unitKeywordList ?? [])].sort(),
      keywords,
      keywordSource,
      sins: [...sins].sort((a, b) => SINS.indexOf(a) - SINS.indexOf(b)),
      attackTypes: [...attackTypes].sort(),
    };
  })
  .sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------------------
// Enums and rules
// ---------------------------------------------------------------------------

const statusSet = new Set<string>(STATUS_KEYWORDS);

const enums: Enums = {
  keywords: KEYWORDS.map((id) => ({
    id,
    name: loc(categoryKo.get(id) ?? id, categoryEn.get(id) ?? id),
    status: statusSet.has(id),
  })),
  factions: [...factionNameById]
    .map(([id, name]) => ({ id, name, deprecated: factionDeprecated.has(id) }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  sinners: SINNER_NAMES.flatMap((name, id) => (id >= 1 ? [{ id, name }] : [])),
  sins: [...SINS],
};

const starlight = common?.data.starlightInfo;
const tierScores: Record<string, number> = {};
for (const row of common?.data.egoGiftCombineTierTable?.combineScoreByEgoGiftTier ?? []) {
  tierScores[String(row.egoGiftTier)] = row.combineScore;
}
const upgradeCostByTier: Record<string, number[]> = {};
for (const row of common?.data.egoGiftUpgradeCostTable?.table ?? []) {
  upgradeCostByTier[String(row.tier)] = row.cost;
}
const probByCount = (rows: { materialCount: number; prob: number }[] | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) out[String(row.materialCount)] = row.prob;
  return out;
};

const startPoolsByKeyword: Record<string, number[]> = {};
for (const pool of common?.data.startEgoGiftPools ?? []) {
  if (!(KEYWORDS as readonly string[]).includes(pool.keyword)) continue;
  startPoolsByKeyword[pool.keyword] = sortNums([...(pool.normalpool ?? []), ...(pool.buffpool ?? [])]);
}

const rules: Rules = {
  dungeonId,
  floors: {
    normal: [1, 2, 3, 4, 5],
    hard: [1, 2, 3, 4, 5],
    parallel: [6, 7, 8, 9, 10],
    extreme: [11, 12, 13, 14, 15],
  },
  difficulty: { hardIsSticky: true, parallelRequiresAllHard: true, extremeAllowsObservation: false },
  deployment: curated.rules.deployment ?? { max: 6, default: 6, verified: false },
  themePacksOfferedPerFloor: common?.data.themePoolNum ?? 3,
  themePackRefreshCount: common?.data.themePoolRecreateCount ?? 1,
  themeObservation: {
    base: starlight?.detectThemeFloorDefaultPoint ?? 20,
    step: starlight?.detectThemeFloorPointMultiplier ?? 10,
    unvisitedMultiplier: starlight?.detectunentrancedThemeFloorPointMultiplier ?? 1.5,
  },
  startGift: {
    pickCount: 1,
    poolsByKeyword: startPoolsByKeyword,
    newKeywordChipCost: common?.data.selectNewStartEgoGiftCategoryChip ?? 12,
    refreshStarlightCost: starlight?.startBuffEgoGiftRefreshDefaultPoint ?? 10,
  },
  giftObservation: curated.rules.giftObservation ?? {
    max: 3,
    fusionResultsAllowed: false,
    costTable: [],
    verified: false,
  },
  starlight: {
    initial: starlight?.initPoint ?? 0,
    hardClearMultiplier: starlight?.rewardInfo?.hardDifficultyBonusMultiplier ?? 1,
  },
  fusion: {
    tierScores,
    resultTierByScore: (common?.data.egoGiftCombineTierTable?.combineTierResultByCombineScore ?? []).map(
      (row) => ({
        min: row.combineScoreRangeMin,
        max: row.combineScoreRangeMax,
        tier: row.tierResult,
      }),
    ),
    successProbabilityByIngredients: probByCount(common?.data.egogiftRandomCombineProbs?.origin),
    successProbabilityWithStarlight: probByCount(common?.data.egogiftRandomCombineProbs?.enabledStarlight),
    maxShopSlots: 3,
  },
  upgradeCostByTier,
  generalGiftPackShare: generalShare,
  hiddenPack: curated.rules.hiddenPack ?? null,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

interface Lock {
  sources: Record<string, { repo: string; sha: string; fetchedAt: string }>;
}
const lock = readJson<Lock>(repoPath('data/sources.lock.json'));

/**
 * A content hash of every input, so `dataVersion` changes exactly when the data does.
 * A wall-clock timestamp here would make every rebuild dirty the git diff.
 */
function inputsFingerprint(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) {
        hash.update(entry);
        hash.update(readJsonStableBytes(full));
      }
    }
  };
  walk(STATIC_DIR);
  walk(LOCALIZE_DIR);
  walk(repoPath('data/curated'));
  return hash.digest('hex').slice(0, 8);
}

function readJsonStableBytes(path: string): string {
  return JSON.stringify(readJson(path));
}

const meta: Meta = {
  dataVersion: `${dungeonId}.${inputsFingerprint()}`,
  schemaVersion: 1,
  dungeon: {
    id: dungeonId,
    name: loc(
      // The dungeon's display name lives in the per-season UI strings.
      findDungeonName('KR'),
      findDungeonName('EN'),
    ),
  },
  sources: Object.fromEntries(
    Object.entries(lock.sources).map(([name, s]) => [
      name,
      { repo: s.repo, sha: s.sha, fetchedAt: s.fetchedAt },
    ]),
  ),
  staticDataPresent: hasStatic,
  counts: {
    gifts: gifts.length,
    packs: packs.length,
    identities: identities.length,
    fusionRecipes: [...recipesByResult.values()].reduce((n, list) => n + list.length, 0) + mixedByResult.size,
  },
};

function findDungeonName(lang: 'KR' | 'EN'): string {
  const path = join(LOCALIZE_DIR, lang, `MirrorDungeonUI_${dungeonId}.json`);
  const raw = readJsonIfExists<{ dataList?: { id: string; content?: string }[] }>(path);
  const entry = raw?.dataList?.find((e) => e.id === `mirror_dungeon_progress_text_${dungeonId}`);
  // "이름과 거미의 거울 {0}층" -> "이름과 거미의 거울"
  return (entry?.content ?? '').replace(/\s*\{0\}.*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

writeJsonStable(join(OUT, 'meta.json'), meta);
writeJsonStable(join(OUT, 'enums.json'), enums);
writeJsonStable(join(OUT, 'rules.json'), rules);
writeJsonStable(join(OUT, 'gifts.json'), gifts);
writeJsonStable(join(OUT, 'packs.json'), packs);
writeJsonStable(join(OUT, 'identities.json'), identities);

const conditionCounts = gifts.reduce(
  (acc, g) => {
    for (const c of g.conditions) acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);

console.log(
  `build-data: dungeon ${dungeonId}, dataVersion ${meta.dataVersion}${lenient ? ' (lenient)' : ''}`,
);
console.log(
  `  gifts ${gifts.length}, packs ${packs.length} (${selectablePacks.length} selectable), ` +
    `identities ${identities.length}, fusion recipes ${meta.counts.fusionRecipes}`,
);
console.log(`  acquisition: ${summarize(gifts.map((g) => g.acquisition.kind))}`);
console.log(`  conditions: ${summarize(gifts.flatMap((g) => g.conditions.map((c) => c.type)))}`);
console.log(`  identity keywords: ${summarize(identities.map((i) => i.keywordSource))}`);
if (missingText.length > 0) {
  console.log(`  ${missingText.length} gift(s) without Korean text: ${missingText.slice(0, 10).join(', ')}`);
}
if (unnamedFactions.length > 0) {
  console.log(
    `  ${unnamedFactions.length} faction(s) without a display name: ${unnamedFactions.join(', ')}` +
      ' — add them to data/curated/factions.json',
  );
}
if (unparsedConditionCount > 0) {
  console.log(`  ${unparsedConditionCount} condition sentence(s) could not be parsed (kept as "unparsed")`);
}
void conditionCounts;

function summarize(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
}
