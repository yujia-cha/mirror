import type { AcquisitionKind, Difficulty, Sin } from '../../core/schema.ts';
import type { UnresolvedReason } from '../../core/types.ts';
import type { StringKey } from '../i18n.ts';

export type BadgeKind = 'sure' | 'maybe' | 'fuse' | 'start' | 'neutral';

/** How an acquisition class reads on a badge: only pack-limited and start gifts are guaranteed. */
export function badgeFor(kind: AcquisitionKind): { badge: BadgeKind; label: StringKey } {
  switch (kind) {
    case 'packLimited':
      return { badge: 'sure', label: 'acqSure' };
    case 'startOnly':
      return { badge: 'start', label: 'acqStart' };
    case 'general':
      return { badge: 'maybe', label: 'acqMaybe' };
    case 'fusionOnly':
      return { badge: 'fuse', label: 'acqFuse' };
    case 'event':
      return { badge: 'neutral', label: 'acqEvent' };
    case 'material':
      return { badge: 'neutral', label: 'acqMaterial' };
    case 'unknown':
      return { badge: 'neutral', label: 'acqUnknown' };
  }
}

export const SIN_LABEL: Record<Sin, StringKey> = {
  WRATH: 'sinWRATH',
  LUST: 'sinLUST',
  SLOTH: 'sinSLOTH',
  GLUTTONY: 'sinGLUTTONY',
  GLOOM: 'sinGLOOM',
  PRIDE: 'sinPRIDE',
  ENVY: 'sinENVY',
};

export const MODE_LABEL: Record<Difficulty, StringKey> = {
  normal: 'modeNormal',
  hard: 'modeHard',
  parallel: 'modeParallel',
  extreme: 'modeExtreme',
};

export const UNRESOLVED_LABEL: Record<UnresolvedReason, StringKey> = {
  'no-pack-in-range': 'unresolvedNoPack',
  'pack-conflict': 'unresolvedConflict',
  'hard-only': 'unresolvedHardOnly',
  'fusion-ingredient-unresolved': 'unresolvedIngredient',
  'not-obtainable': 'unresolvedNotObtainable',
  'observation-budget': 'unresolvedObservation',
};

/** Which band a floor belongs to: 0 = 1-5, 1 = 평행중첩, 2 = EXTREME. */
export function bandOf(floor: number): 0 | 1 | 2 {
  return floor <= 5 ? 0 : floor <= 10 ? 1 : 2;
}
