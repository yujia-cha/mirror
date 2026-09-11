/**
 * Derivations shared by the build script and its tests: pack grouping, floor availability,
 * gift tiers, and identity keywords.
 */
import type { AttackType, Difficulty, PackGroup, Sin, StatusKeyword } from '../../src/core/schema.ts';
import { STATUS_KEYWORDS } from '../../src/core/schema.ts';
import type { RawPersonality, RawSkill, RawThemePack } from './raw.ts';

/** `dungeonIdx` in the static data maps onto the four run modes. */
export const DIFFICULTY_BY_DUNGEON_IDX: Record<number, Difficulty> = {
  0: 'normal',
  1: 'hard',
  2: 'parallel',
  3: 'extreme',
};

/** Floors each mode covers, used when a condition omits `selectableFloors`. */
export const MODE_FLOORS: Record<Difficulty, number[]> = {
  normal: [1, 2, 3, 4, 5],
  hard: [1, 2, 3, 4, 5],
  parallel: [6, 7, 8, 9, 10],
  extreme: [11, 12, 13, 14, 15],
};

export function groupForPackId(id: number): PackGroup {
  if (id >= 1001 && id <= 1099) return 'chapter';
  if (id >= 1101 && id <= 1199) return 'event';
  if (id >= 1201 && id <= 1299) return 'attackType';
  if (id >= 1301 && id <= 1399) return 'sin';
  if (id >= 1401 && id <= 1499) return 'keyword';
  if (id >= 1501 && id <= 1599) return 'longBattle';
  return 'hidden';
}

/**
 * Resolve a pack's floors per mode.
 *
 * `selectableFloors` is 0-indexed within the mode's own range, so Normal/Hard entry `[0,1]` means
 * floors 1 and 2. Parallel and Extreme entries usually omit the list, which means "any floor of
 * that mode" — confirmed against OpenLethe's `MdMapGen.RecreateThemes`.
 */
export function availabilityFor(pack: RawThemePack): Record<Difficulty, number[]> {
  const out: Record<Difficulty, number[]> = { normal: [], hard: [], parallel: [], extreme: [] };
  for (const cond of pack.exceptionConditions ?? []) {
    const mode = DIFFICULTY_BY_DUNGEON_IDX[cond.dungeonIdx];
    if (!mode) continue;
    const floors =
      cond.selectableFloors && cond.selectableFloors.length > 0
        ? cond.selectableFloors.map((f) => f + 1).filter((f) => MODE_FLOORS[mode].includes(f))
        : [...MODE_FLOORS[mode]];
    out[mode] = [...new Set([...out[mode], ...floors])].sort((a, b) => a - b);
  }
  return out;
}

const KEYWORD_BY_KO: Record<string, StatusKeyword> = {
  화상: 'Combustion',
  출혈: 'Laceration',
  진동: 'Vibration',
  파열: 'Burst',
  침잠: 'Sinking',
  호흡: 'Breath',
  충전: 'Charge',
};

const SIN_BY_KO: Record<string, Sin> = {
  분노: 'WRATH',
  색욕: 'LUST',
  나태: 'SLOTH',
  탐식: 'GLUTTONY',
  우울: 'GLOOM',
  오만: 'PRIDE',
  질투: 'ENVY',
};

const ATTACK_BY_KO: Record<string, AttackType> = {
  참격: 'Slash',
  관통: 'Penetrate',
  타격: 'Hit',
};

/**
 * The keyword/sin/attack-type packs encode their theme in the developer `desc`
 * ("화상-1", "분노약점-1", "참격-1"), which is the only machine-readable signal for it.
 */
export function affinitiesFromDevName(devName: string): {
  keyword: StatusKeyword | null;
  sin: Sin | null;
  attackType: AttackType | null;
} {
  const head = devName.replace(/[-\s]?\d+$/, '').replace(/약점$/, '');
  return {
    keyword: KEYWORD_BY_KO[head] ?? null,
    sin: SIN_BY_KO[head] ?? null,
    attackType: ATTACK_BY_KO[head] ?? null,
  };
}

export function tierFromTags(tags: string[]): 1 | 2 | 3 | 4 | 5 | 'EX' | null {
  if (tags.includes('TIER_EX')) return 'EX';
  for (const tag of tags) {
    const m = /^(?:EXTRA_)?TIER_?(\d)$/.exec(tag);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
    }
  }
  return null;
}

/** Identity id is `1SSNN`: sinner 01-12, then the identity index. */
export function sinnerIdFromIdentityId(id: number): number {
  return Math.floor(id / 100) % 100;
}

const STATUS_SET = new Set<string>(STATUS_KEYWORDS);

function keywordsInSkill(skill: RawSkill): Set<StatusKeyword> {
  const found = new Set<StatusKeyword>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const kw = obj['buffKeyword'];
      if (typeof kw === 'string' && STATUS_SET.has(kw)) found.add(kw as StatusKeyword);
      for (const value of Object.values(obj)) visit(value);
    }
  };
  visit(skill.skillData ?? []);
  return found;
}

/**
 * Which status keywords an identity's base attack skills inflict, and how many skills do it.
 *
 * `attributeList` holds exactly the identity's base attack skills, so this counts attack skills
 * only — which is the unit conditional gifts measure ("부여하는 공격 스킬을 보유한 인격").
 *
 * The "특수" variants (특수 화상 etc.) are identity-specific buff ids that cannot be told apart
 * reliably here, so `special` stays false and `data/curated/identity-keywords.json` corrects it.
 */
export function deriveIdentityKeywords(
  personality: RawPersonality,
  skills: Map<number, RawSkill>,
): Partial<Record<StatusKeyword, { skills: number; special: boolean }>> {
  const counts = new Map<StatusKeyword, number>();
  for (const entry of personality.attributeList ?? []) {
    const skill = skills.get(entry.skillId);
    if (!skill) continue;
    if (skill.skillType && skill.skillType !== 'SKILL') continue;
    for (const kw of keywordsInSkill(skill)) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }
  const out: Partial<Record<StatusKeyword, { skills: number; special: boolean }>> = {};
  for (const kw of STATUS_KEYWORDS) {
    const n = counts.get(kw);
    if (n) out[kw] = { skills: n, special: false };
  }
  return out;
}

/** Remove Unity rich-text markup and report whether the name was struck through (deprecated). */
export function cleanFactionName(raw: string): { name: string; deprecated: boolean } {
  const deprecated = /<s>/.test(raw);
  const name = raw.replace(/<[^>]*>/g, '').trim();
  return { name, deprecated };
}

/** Tier order for 조합 계승: 'EX' sits above 5. */
function tierRank(tier: 1 | 2 | 3 | 4 | 5 | 'EX' | null): number | null {
  if (tier === null) return null;
  return tier === 'EX' ? 6 : tier;
}

/**
 * 조합 계승 (`upgradeOf`): ingredient → the one result it upgrades into.
 *
 * An ingredient qualifies when, across every fixed recipe, it feeds exactly one result gift, the
 * two share a status keyword (never `None`), and the result's tier is strictly higher. Such a gift
 * is only ever wanted as a step towards its result, so the UI folds it under the result.
 */
export function deriveUpgradeOf(
  recipesByResult: Map<number, number[][]>,
  giftById: Map<number, { keyword: string; tier: 1 | 2 | 3 | 4 | 5 | 'EX' | null }>,
): Map<number, number> {
  const resultsByIngredient = new Map<number, Set<number>>();
  for (const [result, recipes] of recipesByResult) {
    for (const ingredients of recipes) {
      for (const ingredient of ingredients) {
        const set = resultsByIngredient.get(ingredient) ?? new Set<number>();
        set.add(result);
        resultsByIngredient.set(ingredient, set);
      }
    }
  }
  const out = new Map<number, number>();
  for (const [ingredient, results] of resultsByIngredient) {
    if (results.size !== 1) continue;
    const result = [...results][0]!;
    const lower = giftById.get(ingredient);
    const higher = giftById.get(result);
    if (!lower || !higher) continue;
    if (lower.keyword === 'None' || lower.keyword !== higher.keyword) continue;
    const lo = tierRank(lower.tier);
    const hi = tierRank(higher.tier);
    if (lo === null || hi === null || lo >= hi) continue;
    out.set(ingredient, result);
  }
  return out;
}
