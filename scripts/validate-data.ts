/**
 * Check public/data: schema, referential integrity, then domain invariants.
 *
 *   npm run data:validate
 *   npm run data:validate -- --lenient   downgrade static-data-dependent checks to warnings
 *
 * Messages are prefixed [schema] / [ref] / [invariant] / [stale]; the validate-data skill explains
 * what each class usually means and how to fix it.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { hasFlag, readJson, readJsonIfExists, repoPath } from './lib/io.ts';
import {
  STATUS_KEYWORDS,
  enumsSchema,
  giftsFileSchema,
  identitiesFileSchema,
  metaSchema,
  packsFileSchema,
  rulesSchema,
  type Enums,
  type Gift,
  type Identity,
  type Meta,
  type Rules,
  type ThemePack,
} from '../src/core/schema.ts';

const OUT = repoPath('public/data');
const lenient = hasFlag('--lenient');

const errors: string[] = [];
const warnings: string[] = [];

function err(kind: string, message: string): void {
  errors.push(`[${kind}] ${message}`);
}
function warn(kind: string, message: string): void {
  warnings.push(`[${kind}] ${message}`);
}
/** Static-data-dependent problems are warnings in lenient mode, errors otherwise. */
function strict(kind: string, message: string): void {
  if (lenient) warn(kind, message);
  else err(kind, message);
}

function parseFile<S extends z.ZodTypeAny>(name: string, schema: S): z.infer<S> | null {
  const path = join(OUT, name);
  if (!existsSync(path)) {
    err('schema', `public/data/${name} is missing. Run: npm run data:build`);
    return null;
  }
  const result = schema.safeParse(readJson(path));
  if (!result.success) {
    for (const issue of result.error.issues.slice(0, 25)) {
      err('schema', `${name} ${issue.path.join('.')}: ${issue.message}`);
    }
    if (result.error.issues.length > 25) {
      err('schema', `${name}: ${result.error.issues.length - 25} more schema issue(s)`);
    }
    return null;
  }
  return result.data;
}

const meta: Meta | null = parseFile('meta.json', metaSchema);
const enums: Enums | null = parseFile('enums.json', enumsSchema);
const rules: Rules | null = parseFile('rules.json', rulesSchema);
const gifts: Gift[] | null = parseFile('gifts.json', giftsFileSchema);
const packs: ThemePack[] | null = parseFile('packs.json', packsFileSchema);
const identities: Identity[] | null = parseFile('identities.json', identitiesFileSchema);

if (meta && enums && rules && gifts && packs && identities) {
  checkReferences(gifts, packs, identities, enums);
  checkInvariants(meta, rules, gifts, packs, identities, enums);
  checkCuratedOverrides(gifts, packs, identities);
  checkFreshness();
}

function checkReferences(gifts: Gift[], packs: ThemePack[], identities: Identity[], enums: Enums): void {
  const giftIds = new Set(gifts.map((g) => g.id));
  const giftById = new Map(gifts.map((g) => [g.id, g]));
  const packIds = new Set(packs.map((p) => p.id));
  const factionIds = new Set(enums.factions.map((f) => f.id));

  for (const id of giftIds) {
    if (gifts.filter((g) => g.id === id).length > 1) err('ref', `gift id ${id} appears more than once`);
  }

  for (const pack of packs) {
    for (const giftId of pack.giftPool) {
      if (!giftIds.has(giftId)) err('ref', `pack ${pack.id} giftPool references unknown gift ${giftId}`);
    }
    for (const giftId of pack.exclusiveGifts) {
      if (!pack.giftPool.includes(giftId)) {
        err('ref', `pack ${pack.id} exclusive gift ${giftId} is not in its giftPool`);
      }
    }
  }

  for (const gift of gifts) {
    for (const packId of [...gift.acquisition.packs, ...gift.acquisition.exclusiveTo]) {
      if (!packIds.has(packId)) err('ref', `gift ${gift.id} references unknown pack ${packId}`);
    }
    for (const recipe of gift.fusion?.recipes ?? []) {
      for (const ingredient of recipe.ingredients) {
        if (!giftIds.has(ingredient)) {
          err('ref', `gift ${gift.id} recipe references unknown ingredient ${ingredient}`);
        }
        if (ingredient === gift.id)
          err('invariant', `recipe for gift ${gift.id} lists itself as an ingredient`);
      }
    }
    for (const id of [...(gift.fusion?.mixed?.aPool ?? []), ...(gift.fusion?.mixed?.bPool ?? [])]) {
      if (!giftIds.has(id)) err('ref', `gift ${gift.id} mixed recipe references unknown gift ${id}`);
    }
    if (gift.upgradeOf !== null) {
      const parent = giftById.get(gift.upgradeOf);
      if (!parent) err('ref', `gift ${gift.id} upgradeOf references unknown gift ${gift.upgradeOf}`);
      else {
        if (parent.id === gift.id) err('invariant', `gift ${gift.id} upgradeOf points at itself`);
        if (!(parent.fusion?.recipes ?? []).some((r) => r.ingredients.includes(gift.id)))
          err('invariant', `gift ${gift.id} upgradeOf ${parent.id} but no recipe of ${parent.id} uses it`);
        if (parent.keyword !== gift.keyword || gift.keyword === 'None')
          err('invariant', `gift ${gift.id} upgradeOf ${parent.id} crosses keywords (${gift.keyword} → ${parent.keyword})`);
        const rank = (t: Gift['tier']): number => (t === null ? -1 : t === 'EX' ? 6 : t);
        if (rank(gift.tier) >= rank(parent.tier))
          err('invariant', `gift ${gift.id} (T${gift.tier}) upgradeOf ${parent.id} (T${parent.tier}) is not a lower tier`);
      }
    }
    for (const condition of gift.conditions) {
      if (condition.type === 'factionCount') {
        for (const faction of condition.factions) {
          if (!factionIds.has(faction)) {
            err('ref', `gift ${gift.id} condition references unknown faction "${faction}"`);
          }
        }
      }
    }
  }

  for (const identity of identities) {
    for (const faction of identity.factions) {
      if (!factionIds.has(faction)) {
        err('ref', `identity ${identity.id} references unknown faction "${faction}"`);
      }
    }
    if (Math.floor(identity.id / 100) % 100 !== identity.sinnerId) {
      err('ref', `identity ${identity.id} sinnerId ${identity.sinnerId} does not match its id`);
    }
  }
}

function checkInvariants(
  meta: Meta,
  rules: Rules,
  gifts: Gift[],
  packs: ThemePack[],
  identities: Identity[],
  enums: Enums,
): void {
  const selectable = packs.filter((p) => p.selectable);

  // Expected scale for Mirror Dungeon 7. A real season change moves these; bump them deliberately
  // and say why in the commit message (see the update-game-data skill).
  if (packs.length < 110) strict('invariant', `only ${packs.length} theme packs (expected 110+)`);
  if (selectable.length < 100)
    strict('invariant', `only ${selectable.length} selectable packs (expected 100+)`);
  if (gifts.length < 400) strict('invariant', `only ${gifts.length} gifts (expected 400+)`);
  if (identities.length < 175) strict('invariant', `only ${identities.length} identities (expected 175+)`);
  // 조합 계승 pairs: 76 in MD7. A drift far outside that means the derivation or the recipes changed.
  const upgradePairs = gifts.filter((g) => g.upgradeOf !== null).length;
  if (upgradePairs < 60 || upgradePairs > 100)
    strict('invariant', `${upgradePairs} upgradeOf pairs (expected roughly 76)`);
  if (rules.deployment.max < rules.deployment.default || rules.deployment.max > 12)
    err('invariant', `deployment.max ${rules.deployment.max} must be within default..12`);

  // Every floor a player can reach must have enough packs to fill the selection screen.
  for (const mode of ['normal', 'hard', 'parallel', 'extreme'] as const) {
    for (const floor of rules.floors[mode]) {
      const count = selectable.filter((p) => p.availability[mode].includes(floor)).length;
      if (count < rules.themePacksOfferedPerFloor) {
        strict(
          'invariant',
          `${mode} floor ${floor} has only ${count} selectable pack(s), below themePacksOfferedPerFloor ` +
            `${rules.themePacksOfferedPerFloor}`,
        );
      }
    }
  }

  // Floors 11-15 are EXTREME-only; nothing else may claim them, and EXTREME packs may not claim
  // the 1-10 range.
  for (const pack of selectable) {
    const extremeElsewhere = [
      ...pack.availability.normal,
      ...pack.availability.hard,
      ...pack.availability.parallel,
    ];
    if (extremeElsewhere.some((f) => f > 10)) {
      err('invariant', `pack ${pack.id} claims a floor above 10 outside EXTREME mode`);
    }
    if (pack.availability.extreme.some((f) => f < 11)) {
      err('invariant', `pack ${pack.id} claims an EXTREME floor below 11`);
    }
    if (pack.group === 'longBattle' && extremeElsewhere.length > 0) {
      warn('invariant', `long-battle pack ${pack.id} is also available outside EXTREME`);
    }
  }

  // Keyword packs are Hard-and-above only — a routing rule the planner depends on.
  for (const pack of selectable.filter((p) => p.group === 'keyword')) {
    if (pack.availability.normal.length > 0) {
      strict(
        'invariant',
        `keyword pack ${pack.id} (${pack.name.ko}) is available on Normal, which breaks the Hard-only rule`,
      );
    }
    if (!pack.keywordAffinity) {
      strict('invariant', `keyword pack ${pack.id} (${pack.devName}) has no keywordAffinity`);
    }
  }

  // A fixed-recipe result is shop-only: it must never sit in a pack's drop pool.
  const inAnyPool = new Set(selectable.flatMap((p) => p.giftPool));
  for (const gift of gifts) {
    if (gift.acquisition.kind === 'fusionOnly' && inAnyPool.has(gift.id)) {
      err('invariant', `fusion-only gift ${gift.id} (${gift.name.ko}) appears in a pack pool`);
    }
    if (gift.acquisition.kind === 'packLimited' && gift.acquisition.packs.length === 0) {
      err('invariant', `pack-limited gift ${gift.id} has no pack`);
    }
    if (gift.acquisition.exclusiveTo.some((p) => !gift.acquisition.packs.includes(p))) {
      err('invariant', `gift ${gift.id} is exclusive to a pack that does not list it in giftPool`);
    }
  }

  // 클리어 보상 gifts hang off exactly one EXTREME pack; hidden-battle gifts off none. Together with
  // the choice-event gifts they are precisely the season's globalExcludeEgoGifts.
  const packById = new Map(packs.map((p) => [p.id, p]));
  for (const gift of gifts) {
    const { kind, clearRewardOf, packs: giftPacks } = gift.acquisition;
    if (kind === 'clearReward') {
      const pack = clearRewardOf !== null ? packById.get(clearRewardOf) : undefined;
      if (!pack) err('invariant', `clear-reward gift ${gift.id} (${gift.name.ko}) names no pack`);
      else {
        if (pack.availability.extreme.length === 0) err('invariant', `clear-reward gift ${gift.id} pack ${pack.id} is not an EXTREME pack`);
        if (giftPacks.length !== 1 || giftPacks[0] !== pack.id) err('invariant', `clear-reward gift ${gift.id} must list only pack ${pack.id}`);
      }
    } else if (clearRewardOf !== null) {
      err('invariant', `gift ${gift.id} has clearRewardOf but kind ${kind}`);
    }
    if (kind === 'hiddenBattle' && giftPacks.length > 0) err('invariant', `hidden-battle gift ${gift.id} must not list packs`);
    if ((kind === 'clearReward' || kind === 'hiddenBattle') && gift.observable) {
      err('invariant', `gift ${gift.id} (${kind}) is in the observation pool, which the planner does not expect`);
    }
  }
  const dropPoolFile = readJsonIfExists<{ list?: { dungeonId: number; globalExcludeEgoGifts?: number[] }[] }>(
    repoPath(`data/raw/static/mirrordungeon-egogift-droppool/mirrordungeon-egogift-droppool-${rules.dungeonId}.json`),
  );
  const globalExclude = dropPoolFile?.list?.find((p) => p.dungeonId === rules.dungeonId)?.globalExcludeEgoGifts;
  if (globalExclude) {
    const offPath = gifts
      .filter((g) => ['event', 'clearReward', 'hiddenBattle'].includes(g.acquisition.kind))
      .map((g) => g.id)
      .sort((a, b) => a - b)
      .join(',');
    const expected = [...globalExclude].sort((a, b) => a - b).join(',');
    if (offPath !== expected) {
      strict('invariant', `event ∪ clearReward ∪ hiddenBattle (${offPath}) differs from globalExcludeEgoGifts (${expected})`);
    }
  }
  if (rules.hiddenBattle) {
    for (const id of rules.hiddenBattle.gifts) {
      if (gifts.find((g) => g.id === id)?.acquisition.kind !== 'hiddenBattle') err('invariant', `rules.hiddenBattle lists ${id}, which is not a hidden-battle gift`);
    }
  }

  // EXTREME packs carry no exclusives, so their pool is exactly the general gift set. This is the
  // cross-check that the general/exclusive split is still being derived correctly.
  const generalGifts = new Set(gifts.filter((g) => g.acquisition.kind === 'general').map((g) => g.id));
  const extremePack = selectable.find((p) => p.group === 'longBattle' && p.exclusiveGifts.length === 0);
  if (extremePack) {
    const pool = new Set(extremePack.giftPool);
    const onlyInGeneral = [...generalGifts].filter((id) => !pool.has(id));
    const onlyInPool = [...pool].filter((id) => !generalGifts.has(id));
    if (onlyInGeneral.length > 0 || onlyInPool.length > 0) {
      strict(
        'invariant',
        `general gift set (${generalGifts.size}) does not match EXTREME pack ${extremePack.id} pool (${pool.size}): ` +
          `${onlyInGeneral.length} general-only, ${onlyInPool.length} pool-only`,
      );
    }
  } else {
    warn('invariant', 'no EXTREME pack without exclusives found; skipped the general-gift cross-check');
  }

  // Hard-only gifts must not be reachable on a Normal-only route.
  for (const gift of gifts.filter((g) => g.hardOnly && g.acquisition.kind === 'packLimited')) {
    const normalOnly = gift.acquisition.packs
      .map((id) => selectable.find((p) => p.id === id))
      .filter((p): p is ThemePack => Boolean(p))
      .some((p) => p.availability.normal.length > 0 && p.availability.hard.length === 0);
    if (normalOnly) {
      warn('invariant', `hard-only gift ${gift.id} (${gift.name.ko}) is exclusive to a Normal-only pack`);
    }
  }

  if (rules.dungeonId !== meta.dungeon.id) {
    err('invariant', `rules.dungeonId ${rules.dungeonId} != meta.dungeon.id ${meta.dungeon.id}`);
  }
  if (!meta.dungeon.name.ko) warn('invariant', 'meta.dungeon.name.ko is empty');
  if (meta.counts.gifts !== gifts.length) err('invariant', 'meta.counts.gifts is stale');
  if (meta.counts.packs !== packs.length) err('invariant', 'meta.counts.packs is stale');
  if (meta.counts.identities !== identities.length) err('invariant', 'meta.counts.identities is stale');

  if (!rules.giftObservation.verified) {
    warn(
      'invariant',
      'rules.giftObservation is unverified (costTable taken from an older season). Confirm in-game, ' +
        'then update data/curated/rules.json.',
    );
  }

  // Conditions the planner can evaluate, versus ones the user has to read.
  const unparsed = gifts.filter((g) => g.conditions.some((c) => c.type === 'unparsed'));
  if (unparsed.length > 3) {
    warn(
      'invariant',
      `${unparsed.length} gift(s) have unparsed conditions: ${unparsed
        .slice(0, 6)
        .map((g) => g.id)
        .join(', ')}` + ' — consider extending the parser or adding data/curated/conditions.json entries',
    );
  }

  // The 특수 variants (특수 충전 …) are read off BattleKeywords.json; losing them all means the
  // description format changed, not that the game dropped the mechanic.
  if (!identities.some((i) => Object.values(i.keywords).some((k) => k.specialSkills > 0))) {
    strict('invariant', 'no identity inflicts a 특수 keyword variant; check readSpecialVariants() against BattleKeywords.json');
  }

  // 탄환 is read off the `[necessary:Bullet:n]` requirement tokens in skill scripts. None at all
  // means that syntax changed, not that the game dropped ammo.
  if (!identities.some((i) => i.keywords.Bullet)) {
    strict('invariant', 'no identity uses 탄환; check the skill requirement tokens in scripts/lib/derive.ts');
  }

  for (const entry of enums.identityOnlyKeywords) {
    if (entry.name.ko === entry.id || entry.name.en === entry.id) {
      err('invariant', `identity-only keyword ${entry.id} has no localized name; check BattleKeywords.json`);
    }
  }

  // `dominantKeyword` only ever offers a status keyword as an automatic start, because these are
  // the pools that exist. A missing pool would silently hand the player no starting gift.
  for (const keyword of STATUS_KEYWORDS) {
    if ((rules.startGift.poolsByKeyword[keyword] ?? []).length === 0) {
      strict('invariant', `status keyword ${keyword} has no starting gift pool`);
    }
  }

  const noKeyword = identities.filter((i) => i.keywordSource === 'none');
  if (noKeyword.length > 20) {
    strict(
      'invariant',
      `${noKeyword.length} identities have no keywords derived; skill data may be incomplete`,
    );
  }

  // Identities present in the localization but missing from the static data cannot be planned with.
  const localizedIdentities = readJsonIfExists<{ dataList?: { id: number }[] }>(
    repoPath('data/raw/localize/KR/Personalities.json'),
  );
  if (localizedIdentities?.dataList) {
    const staticIds = new Set(identities.map((i) => i.id));
    const missing = localizedIdentities.dataList
      .map((e) => Number(e.id))
      // Identity ids are 1SSNN for sinners 01-12; anything else is a story or NPC row.
      .filter((id) => id >= 10101 && id <= 11299 && !staticIds.has(id));
    if (missing.length > 0) {
      warn(
        'invariant',
        `${missing.length} identity/identities exist in the localization but not in the static data ` +
          `(${missing.join(', ')}); they cannot be used in a deck until upstream ships their data`,
      );
    }
  }
}

function checkCuratedOverrides(gifts: Gift[], packs: ThemePack[], identities: Identity[]): void {
  const giftIds = new Set(gifts.map((g) => g.id));
  const packIds = new Set(packs.map((p) => p.id));
  const identityIds = new Set(identities.map((i) => i.id));

  const check = (file: string, ids: Iterable<string>, known: Set<number>, label: string): void => {
    for (const raw of ids) {
      if (raw.startsWith('_')) continue;
      const id = Number(raw);
      if (!Number.isFinite(id) || !known.has(id)) {
        err('invariant', `curated override ${file} references unknown ${label} id "${raw}"`);
      }
    }
  };

  const conditions = readJsonIfExists<Record<string, unknown>>(repoPath('data/curated/conditions.json'));
  if (conditions) check('conditions.json', Object.keys(conditions), giftIds, 'gift');

  const identityKeywords = readJsonIfExists<Record<string, unknown>>(
    repoPath('data/curated/identity-keywords.json'),
  );
  if (identityKeywords)
    check('identity-keywords.json', Object.keys(identityKeywords), identityIds, 'identity');

  const names = readJsonIfExists<{
    gifts?: Record<string, unknown>;
    packs?: Record<string, unknown>;
    identities?: Record<string, unknown>;
  }>(repoPath('data/curated/names-override.json'));
  if (names) {
    check('names-override.json gifts', Object.keys(names.gifts ?? {}), giftIds, 'gift');
    check('names-override.json packs', Object.keys(names.packs ?? {}), packIds, 'pack');
    check('names-override.json identities', Object.keys(names.identities ?? {}), identityIds, 'identity');
  }

  const notes = readJsonIfExists<{ gifts?: Record<string, unknown>; packs?: Record<string, unknown> }>(
    repoPath('data/curated/notes.json'),
  );
  if (notes) {
    check('notes.json gifts', Object.keys(notes.gifts ?? {}), giftIds, 'gift');
    check('notes.json packs', Object.keys(notes.packs ?? {}), packIds, 'pack');
  }
}

/** Generated output older than its inputs means someone forgot to rebuild. */
function checkFreshness(): void {
  const metaPath = join(OUT, 'meta.json');
  if (!existsSync(metaPath)) return;
  const builtAt = statSync(metaPath).mtimeMs;
  const newer: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.json') && st.mtimeMs > builtAt)
        newer.push(full.replace(`${repoPath('')}/`, ''));
    }
  };
  walk(repoPath('data/raw'));
  walk(repoPath('data/curated'));
  if (newer.length > 0) {
    warn(
      'stale',
      `${newer.length} input file(s) are newer than public/data (e.g. ${newer[0]}). Run: npm run data:build`,
    );
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

if (errors.length > 0) {
  console.error(`\ndata:validate failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`data:validate passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
