import { useMemo, useState } from 'react';
import { FormationDeckCode } from 'limbus-formation-deck';
import type { Enums, GameData, Identity } from '../core/schema.ts';
import { analyseDeck } from '../core/index.ts';
import type { GameIndexes } from '../core/types.ts';
import { pick, t, type Lang } from './i18n.ts';
import { useApp } from './store.ts';
import { Button, Chip, Section } from './ui.tsx';
import { factionName, keywordName } from './format.ts';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  lang: Lang;
}

export function DeckPanel({ data, indexes, lang }: Props) {
  const deck = useApp((s) => s.deck);
  const setDeckSlot = useApp((s) => s.setDeckSlot);
  const setDeck = useApp((s) => s.setDeck);
  const clearDeck = useApp((s) => s.clearDeck);

  const [openSinner, setOpenSinner] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const bySinner = useMemo(() => {
    const map = new Map<number, Identity>();
    for (const id of deck) {
      const identity = indexes.identityById.get(id);
      if (identity) map.set(identity.sinnerId, identity);
    }
    return map;
  }, [deck, indexes]);

  const stats = useMemo(() => analyseDeck(deck, indexes, data.rules.deployment), [deck, indexes, data.rules.deployment]);

  return (
    <Section
      title={t('deckHeading', lang)}
      hint={t('deckHint', lang)}
      actions={
        <>
          <Button onClick={() => setImportOpen((open) => !open)}>{t('deckImport', lang)}</Button>
          <Button onClick={clearDeck} disabled={deck.length === 0} variant="ghost">
            {t('deckClear', lang)}
          </Button>
        </>
      }
    >
      {importOpen ? <ImportForm lang={lang} indexes={indexes} onImport={setDeck} /> : null}

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.enums.sinners.map((sinner, index) => {
          const identity = bySinner.get(sinner.id);
          const isDeployed = identity ? stats.deployed.includes(identity.id) : false;
          return (
            <li key={sinner.id}>
              <button
                type="button"
                onClick={() => setOpenSinner(openSinner === sinner.id ? null : sinner.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-left transition-colors hover:border-amber-400 dark:border-stone-700"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-stone-400">{index + 1}</span>
                    <span className="text-sm font-medium">{pick(sinner.name, lang)}</span>
                    {identity ? (
                      <Chip tone={isDeployed ? 'accent' : 'neutral'}>
                        {t(isDeployed ? 'deckDeployed' : 'deckReserve', lang)}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">
                    {identity ? pick(identity.title, lang) : t('deckEmptySlot', lang)}
                  </span>
                </span>
                {identity ? (
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {Object.keys(identity.keywords).length === 0 ? (
                      <Chip tone="warn" title={t('deckKeywordUnknown', lang)}>
                        ?
                      </Chip>
                    ) : (
                      Object.keys(identity.keywords).map((keyword) => (
                        <Chip key={keyword}>{keywordName(keyword as never, data.enums, lang)}</Chip>
                      ))
                    )}
                  </span>
                ) : null}
              </button>

              {openSinner === sinner.id ? (
                <IdentityPicker
                  sinnerId={sinner.id}
                  data={data}
                  lang={lang}
                  selected={identity?.id ?? null}
                  onPick={(identityId) => {
                    setDeckSlot(sinner.id, identityId);
                    setOpenSinner(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <DeckSummary stats={stats} enums={data.enums} lang={lang} />
    </Section>
  );
}

function ImportForm({
  lang,
  indexes,
  onImport,
}: {
  lang: Lang;
  indexes: GameIndexes;
  onImport: (deck: number[]) => void;
}) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const apply = (): void => {
    try {
      const result = FormationDeckCode.decode(code.trim());
      const ids = result.formations
        .filter((formation) => formation.personalityId > 0)
        .map((formation) => formation.personalityId);
      const known = ids.filter((id) => indexes.identityById.has(id));
      if (known.length === 0) {
        setMessage(t('deckImportFailed', lang));
        return;
      }
      onImport(known);
      setMessage(known.length < ids.length ? t('deckImportPartial', lang) : null);
    } catch {
      setMessage(t('deckImportFailed', lang));
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <label className="block text-xs text-stone-500 dark:text-stone-400" htmlFor="formation-code">
        {t('deckImportHint', lang)}
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="formation-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-stone-600 dark:bg-stone-950"
        />
        <Button variant="primary" onClick={apply} disabled={code.trim().length === 0}>
          {t('deckImportApply', lang)}
        </Button>
      </div>
      {message ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{message}</p> : null}
    </div>
  );
}

function IdentityPicker({
  sinnerId,
  data,
  lang,
  selected,
  onPick,
}: {
  sinnerId: number;
  data: GameData;
  lang: Lang;
  selected: number | null;
  onPick: (identityId: number | null) => void;
}) {
  const [query, setQuery] = useState('');

  const identities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.identities
      .filter((identity) => identity.sinnerId === sinnerId)
      .filter((identity) => {
        if (needle.length === 0) return true;
        const haystack = [
          identity.title.ko,
          identity.title.en,
          ...identity.factions.map((f) => factionName(f, data.enums, 'ko')),
          ...identity.factions.map((f) => factionName(f, data.enums, 'en')),
          ...Object.keys(identity.keywords).map((k) => keywordName(k as never, data.enums, 'ko')),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => b.rank - a.rank || a.id - b.id);
  }, [data, sinnerId, query]);

  return (
    <div className="mt-2 rounded-lg border border-amber-400/50 bg-amber-50/40 p-2 dark:bg-amber-500/5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('deckSearchPlaceholder', lang)}
        className="mb-2 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-600 dark:bg-stone-950"
      />
      <div className="max-h-64 overflow-y-auto">
        {selected !== null ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            {t('deckEmptySlot', lang)}
          </button>
        ) : null}
        <ul>
          {identities.map((identity) => (
            <li key={identity.id}>
              <button
                type="button"
                onClick={() => onPick(identity.id)}
                aria-pressed={identity.id === selected}
                className={`flex w-full flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  identity.id === selected ? 'bg-amber-500/20' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <span className="font-medium">{pick(identity.title, lang)}</span>
                <span className="text-[11px] text-stone-400">{'★'.repeat(identity.rank)}</span>
                {identity.factions.slice(0, 2).map((faction) => (
                  <Chip key={faction}>{factionName(faction, data.enums, lang)}</Chip>
                ))}
                {Object.keys(identity.keywords).map((keyword) => (
                  <Chip key={keyword} tone="accent">
                    {keywordName(keyword as never, data.enums, lang)}
                  </Chip>
                ))}
                {identity.keywordSource === 'none' ? (
                  <Chip tone="warn" title={t('deckKeywordUnknown', lang)}>
                    ?
                  </Chip>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {identities.length === 0 ? (
          <p className="px-2 py-3 text-xs text-stone-500">{t('giftsNone', lang)}</p>
        ) : null}
      </div>
    </div>
  );
}

function DeckSummary({
  stats,
  enums,
  lang,
}: {
  stats: ReturnType<typeof analyseDeck>;
  enums: Enums;
  lang: Lang;
}) {
  const keywords = Object.entries(stats.keywordCounts.formation).sort((a, b) => b[1]! - a[1]!);
  const factions = Object.entries(stats.factionCounts.formation)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (stats.deployed.length === 0) return null;

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      <h3 className="mb-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
        {t('deckSummary', lang)}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {keywords.length === 0 ? (
          <Chip tone="warn">{t('deckNoKeywords', lang)}</Chip>
        ) : (
          keywords.map(([keyword, count]) => (
            <Chip key={keyword} tone="accent">
              {keywordName(keyword as never, enums, lang)} {count}
            </Chip>
          ))
        )}
        {factions.map(([faction, count]) => (
          <Chip key={faction}>
            {factionName(faction, enums, lang)} {count}
          </Chip>
        ))}
      </div>
      {stats.identitiesWithoutKeywords.length > 0 ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('deckKeywordUnknown', lang)}</p>
      ) : null}
    </div>
  );
}
