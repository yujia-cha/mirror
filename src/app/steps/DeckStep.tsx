import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Plus, Search, X } from 'lucide-react';
import type { GameData, Identity } from '../../core/schema.ts';
import type { DeckStats, GameIndexes } from '../../core/types.ts';
import { pick, t, type Lang } from '../i18n.ts';
import { sinnerOf, useApp } from '../store.ts';
import { factionName, keywordName } from '../format.ts';
import { identitiesFromFormationCode } from '../lib/formation-code.ts';
import { deckSummaryChips } from '../lib/deck-summary.ts';
import { stepIndex, useDismiss } from '../lib/useDismiss.ts';
import { Button, Chip, Notice } from '../components/ui.tsx';

interface Props {
  data: GameData;
  indexes: GameIndexes;
  stats: DeckStats;
  lang: Lang;
}

function matches(identity: Identity, needle: string, data: GameData): boolean {
  if (needle.length === 0) return true;
  const haystack = [
    identity.title.ko,
    identity.title.en,
    identity.sinner.ko,
    identity.sinner.en,
    ...identity.factions.flatMap((f) => [factionName(f, data.enums, 'ko'), factionName(f, data.enums, 'en')]),
    ...Object.keys(identity.keywords).flatMap((k) => [keywordName(k as never, data.enums, 'ko'), keywordName(k as never, data.enums, 'en')]),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function KeywordChips({ identity, data, lang }: { identity: Identity; data: GameData; lang: Lang }) {
  const entries = Object.entries(identity.keywords);
  if (entries.length === 0) {
    return identity.keywordSource === 'none' ? (
      <Chip title={t('deckKeywordUnknown', lang)}>?</Chip>
    ) : null;
  }
  return (
    <>
      {entries.map(([keyword, info]) => (
        <Chip key={keyword} title={t('deckKeywordSkills', lang, { keyword: keywordName(keyword as never, data.enums, lang), n: info.skills })}>
          {keywordName(keyword as never, data.enums, lang)} <b className="font-semibold text-fg">{info.skills}</b>
        </Chip>
      ))}
    </>
  );
}

export function DeckStep({ data, indexes, stats, lang }: Props) {
  const deck = useApp((s) => s.deck);
  const deployed = useApp((s) => s.deployed);
  const setDeckSlot = useApp((s) => s.setDeckSlot);
  const setDeck = useApp((s) => s.setDeck);
  const toggleDeployed = useApp((s) => s.toggleDeployed);
  const max = data.rules.deployment.max;
  const full = deployed.length >= max;

  const [query, setQuery] = useState('');
  const [openSinner, setOpenSinner] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [code, setCode] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const bySinner = useMemo(() => new Map(deck.map((id) => [sinnerOf(id), id])), [deck]);
  const needle = query.trim().toLowerCase();
  const globalResults = useMemo(() => {
    if (needle.length === 0) return [];
    return data.identities
      .filter((identity) => matches(identity, needle, data))
      .sort((a, b) => a.sinnerId - b.sinnerId || b.rank - a.rank || a.id - b.id)
      .slice(0, 40);
  }, [data, needle]);
  const listOpen = needle.length > 0;
  const closeSearch = useCallback(() => setQuery(''), []);
  useDismiss(searchRef, closeSearch, listOpen);
  useEffect(() => setActiveIndex(0), [needle]);
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const next = stepIndex(event.key, activeIndex, globalResults.length);
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
    } else if (event.key === 'Enter' && listOpen && globalResults[activeIndex]) {
      event.preventDefault();
      pickIdentity(globalResults[activeIndex]);
    }
  };

  const pickIdentity = (identity: Identity): void => {
    setDeckSlot(identity.sinnerId, identity.id, data.rules.deployment.default);
    setQuery('');
    setOpenSinner(null);
  };

  const applyImport = (): void => {
    const result = identitiesFromFormationCode(code, indexes);
    if (!result) {
      setImportMessage(t('deckImportFailed', lang));
      return;
    }
    setDeck(result.ids, data.rules.deployment.default);
    setImportMessage(result.skipped > 0 ? t('deckImportPartial', lang) : null);
    if (result.skipped === 0) setImportOpen(false);
  };

  const chips = deckSummaryChips(stats, data.enums, lang);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-wrap items-center gap-2" ref={searchRef}>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border border-line-strong bg-surface px-2.5 text-sm">
          <Search size={14} aria-hidden className="flex-none text-fg-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t('deckSearchAll', lang)}
            aria-label={t('deckSearchAll', lang)}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="deck-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={listOpen && globalResults[activeIndex] ? `deck-option-${globalResults[activeIndex].id}` : undefined}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={t('deckClose', lang)} className="text-fg-3">
              <X size={14} />
            </button>
          ) : null}
        </label>
        <span
          className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-3 text-sm font-medium"
          title={full ? t('deckDeployedFull', lang, { max }) : undefined}
        >
          {t('deckDeployed', lang)} <span className="font-mono">{deployed.length}/{max}</span>
        </span>
        <Button onClick={() => setImportOpen((v) => !v)} ariaLabel={t('deckImport', lang)} className="h-9">
          <Copy size={14} aria-hidden />
          <span className="hidden sm:inline">{t('deckImport', lang)}</span>
        </Button>
        {listOpen ? (
          <div
            id="deck-search-listbox"
            role="listbox"
            aria-label={t('deckSearchAll', lang)}
            className="absolute left-0 top-10 z-20 flex max-h-[420px] w-full max-w-[560px] flex-col overflow-y-auto rounded-md border border-line-strong bg-surface shadow-pop"
          >
            <div className="border-b border-line px-3 py-2 text-xs text-fg-3">
              {globalResults.length > 0 ? t('deckSearchHint', lang, { n: globalResults.length }) : t('deckSearchNone', lang)}
            </div>
            {globalResults.map((identity, i) => (
              <button
                key={identity.id}
                id={`deck-option-${identity.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => pickIdentity(identity)}
                onPointerMove={() => setActiveIndex(i)}
                className={`flex h-11 items-center gap-3 border-b border-line px-3 text-left hover:bg-surface-2 ${i === activeIndex ? 'bg-surface-2' : ''}`}
              >
                <span className="w-16 flex-none text-xs font-medium text-fg-2">{pick(identity.sinner, lang)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {pick(identity.title, lang)}
                  <span className="text-xs text-fg-3"> · {t('deckRank', lang, { n: identity.rank })}</span>
                </span>
                <span className="hidden gap-1 sm:flex">
                  <KeywordChips identity={identity} data={data} lang={lang} />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {importOpen ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyImport();
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-label={t('deckImportPlaceholder', lang)}
            placeholder={t('deckImportPlaceholder', lang)}
            className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-2 font-mono text-xs outline-none"
          />
          <Button type="submit" variant="primary">
            {t('deckImportApply', lang)}
          </Button>
          {importMessage ? <span className="w-full text-xs text-fg-2">{importMessage}</span> : null}
        </form>
      ) : null}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('tabDeck', lang)}>
        {data.enums.sinners.map((sinner) => {
          const id = bySinner.get(sinner.id) ?? null;
          const identity = id !== null ? indexes.identityById.get(id) : undefined;
          const isDeployed = id !== null && deployed.includes(id);
          const open = openSinner === sinner.id;
          return (
            <li
              key={sinner.id}
              className={`relative flex flex-col gap-1.5 rounded-md p-3 ${
                identity
                  ? isDeployed
                    ? 'border border-line-strong bg-surface shadow-card'
                    : 'border border-line bg-surface-2'
                  : 'border border-dashed border-line-strong'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-fg-2">{pick(sinner.name, lang)}</span>
                {identity ? (
                  <label
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${isDeployed ? 'text-fg' : 'text-fg-3'}`}
                    title={!isDeployed && full ? t('deckDeployedFull', lang, { max }) : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={isDeployed}
                      disabled={!isDeployed && full}
                      onChange={() => toggleDeployed(identity.id, max)}
                      aria-label={`${pick(sinner.name, lang)} ${t('deckDeployed', lang)}`}
                      className="h-4 w-4 accent-[var(--color-ink)]"
                    />
                    {isDeployed ? t('deckDeployed', lang) : t('deckReserve', lang)}
                  </label>
                ) : (
                  <span className="text-xs text-fg-3">{t('deckReserve', lang)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenSinner(open ? null : sinner.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-col items-start gap-1 rounded-sm text-left hover:underline"
              >
                {identity ? (
                  <>
                    <span className="flex min-w-0 max-w-full items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{pick(identity.title, lang)}</span>
                      <span className="flex-none text-xs text-fg-3">{t('deckRank', lang, { n: identity.rank })}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <KeywordChips identity={identity} data={data} lang={lang} />
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-fg-3">
                    <Plus size={13} aria-hidden />
                    {t('deckEmptySlot', lang)}
                  </span>
                )}
              </button>
              {open ? (
                <SinnerPicker
                  sinner={sinner.id}
                  sinnerName={pick(sinner.name, lang)}
                  data={data}
                  lang={lang}
                  selected={id}
                  onPick={(picked) => {
                    setDeckSlot(sinner.id, picked, data.rules.deployment.default);
                    setOpenSinner(null);
                  }}
                  onClose={() => setOpenSinner(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {deck.length === 0 ? (
        <p className="text-xs text-fg-3">{t('deckEmptyHint', lang)}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Chip key={chip.label} title={t('deckFormationCount', lang, { n: chip.formation })}>
              {chip.label} <b className="font-semibold text-fg">{chip.count}</b>
            </Chip>
          ))}
          <span className="text-xs text-fg-3">{t('deckSummaryBasis', lang)}</span>
        </div>
      )}

      {stats.identitiesWithoutKeywords.length > 0 ? <Notice>{t('deckKeywordUnknown', lang)}</Notice> : null}

    </div>
  );
}

function SinnerPicker({
  sinner,
  sinnerName,
  data,
  lang,
  selected,
  onPick,
  onClose,
}: {
  sinner: number;
  sinnerName: string;
  data: GameData;
  lang: Lang;
  selected: number | null;
  onPick: (identityId: number | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const needle = query.trim().toLowerCase();
  const all = data.identities.filter((identity) => identity.sinnerId === sinner);
  const identities = all
    .filter((identity) => matches(identity, needle, data))
    .sort((a, b) => b.rank - a.rank || a.id - b.id);
  useDismiss(ref, onClose, true);
  useEffect(() => setActiveIndex(0), [needle]);
  const onKey = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const next = stepIndex(event.key, activeIndex, identities.length);
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
    } else if (event.key === 'Enter' && identities[activeIndex]) {
      event.preventDefault();
      onPick(identities[activeIndex].id);
    }
  };
  return (
    <div
      ref={ref}
      className="mt-1 flex flex-col overflow-hidden rounded-md border border-line-strong bg-surface shadow-pop sm:absolute sm:left-0 sm:top-full sm:z-20 sm:mt-0 sm:w-[340px] sm:max-w-[calc(100vw-32px)]"
      data-testid="sinner-picker"
    >
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls={`sinner-listbox-${sinner}`}
          aria-autocomplete="list"
          aria-activedescendant={identities[activeIndex] ? `sinner-option-${identities[activeIndex].id}` : undefined}
          placeholder={t('deckSinnerSearch', lang, { sinner: sinnerName })}
          aria-label={t('deckSinnerSearch', lang, { sinner: sinnerName })}
          className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-2 text-xs outline-none"
        />
        <button type="button" onClick={onClose} aria-label={t('deckClose', lang)} className="text-fg-3">
          <X size={14} />
        </button>
      </div>
      <ul className="max-h-64 overflow-y-auto" role="listbox" id={`sinner-listbox-${sinner}`}>
        {selected !== null ? (
          <li>
            <button type="button" onClick={() => onPick(null)} className="flex h-9 w-full items-center px-3 text-left text-xs text-fg-2 hover:bg-surface-2">
              {t('deckClearSlot', lang)}
            </button>
          </li>
        ) : null}
        {identities.map((identity, i) => (
          <li key={identity.id} role="option" id={`sinner-option-${identity.id}`} aria-selected={i === activeIndex}>
            <button
              type="button"
              onClick={() => onPick(identity.id)}
              onPointerMove={() => setActiveIndex(i)}
              aria-pressed={identity.id === selected}
              className={`flex min-h-11 w-full flex-wrap items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                identity.id === selected || i === activeIndex ? 'bg-surface-2' : ''
              }`}
            >
              <span className="font-medium text-fg">{pick(identity.title, lang)}</span>
              <span className="text-xs text-fg-3">{t('deckRank', lang, { n: identity.rank })}</span>
              <KeywordChips identity={identity} data={data} lang={lang} />
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-3 py-1.5 text-xs text-fg-3">
        {t('deckShowing', lang, { total: all.length, n: identities.length })}
      </div>
    </div>
  );
}
