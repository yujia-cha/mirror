import {
  enumsSchema,
  giftsFileSchema,
  identitiesFileSchema,
  metaSchema,
  packsFileSchema,
  rulesSchema,
  type GameData,
} from '../schema.ts';

const FILES = ['meta', 'enums', 'rules', 'gifts', 'packs', 'identities'] as const;

/**
 * Load the generated game data.
 *
 * `baseUrl` must end in a slash and is normally `import.meta.env.BASE_URL`: GitHub Pages serves
 * the app from a sub-path, so an absolute `/data/...` would 404 there.
 *
 * Validation runs only when asked, because parsing 446 gifts through Zod on every page load is
 * wasted work in production — the data was already validated in CI.
 */
export async function loadGameData(baseUrl = '/', options: { validate?: boolean } = {}): Promise<GameData> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const [meta, enums, rules, gifts, packs, identities] = await Promise.all(
    FILES.map(async (name) => {
      const response = await fetch(`${base}data/${name}.json`);
      if (!response.ok) {
        throw new Error(`게임 데이터를 불러올 수 없습니다: ${name}.json (${response.status})`);
      }
      return response.json() as Promise<unknown>;
    }),
  );

  if (options.validate) {
    return {
      meta: metaSchema.parse(meta),
      enums: enumsSchema.parse(enums),
      rules: rulesSchema.parse(rules),
      gifts: giftsFileSchema.parse(gifts),
      packs: packsFileSchema.parse(packs),
      identities: identitiesFileSchema.parse(identities),
    };
  }

  return {
    meta,
    enums,
    rules,
    gifts,
    packs,
    identities,
  } as GameData;
}
