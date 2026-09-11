import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  enumsSchema,
  giftsFileSchema,
  identitiesFileSchema,
  metaSchema,
  packsFileSchema,
  rulesSchema,
  type GameData,
} from '../schema.ts';

/**
 * Read the generated data straight off disk, for Vitest and scripts/route-cli.ts.
 * Always validates: a test or CLI run that silently accepts malformed data is worse than slow.
 */
export function loadGameDataFromDisk(dir = resolve(process.cwd(), 'public/data')): GameData {
  const read = (name: string): unknown => JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8'));
  return {
    meta: metaSchema.parse(read('meta')),
    enums: enumsSchema.parse(read('enums')),
    rules: rulesSchema.parse(read('rules')),
    gifts: giftsFileSchema.parse(read('gifts')),
    packs: packsFileSchema.parse(read('packs')),
    identities: identitiesFileSchema.parse(read('identities')),
  };
}
