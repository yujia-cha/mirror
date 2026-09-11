import { useMemo, useState } from 'react';
import type { AcquisitionKind, GameData, Gift, Keyword } from '../core/schema.ts';
import { analyseDeck, evaluateConditions } from '../core/index.ts';
import type { ConditionReport, GameIndexes } from '../core/types.ts';
import { pick, t, type Lang, type StringKey } from './i18n.ts';
import { useApp } from './store.ts';
import { Button, Chip, KeywordChip, Section, TierBadge, Toggle } from './ui.tsx';
import { renderEffect } from './format.ts';
import { conditionText, reachedTierText } from './condition-text.ts';

const ACQUISITION_LABEL: Record<AcquisitionKind, StringKey> = {
  general: 'acquisitionGeneral',
  packLimited: 'acquisitionPackLimited',
  fusionOnly: 'acquisitionFusionOnly',
  startOnly: 'acquisitionStartOnly',
  event: 'acquisitionEvent',
  material: 'acquisitionMaterial',
  unknown: 'acquisitionUnknown',
};

type TierFilter = 'all' | '1' | '2' | '3' | '4' | '5';

export function GiftPanel({ data, indexes, lang }: { data: GameData; indexes: GameIndexes; lang: Lang }) {
  const wanted = useApp((s) => s.wanted);
  const deck = useApp((s) => s.deck);
  const toggleWanted = useApp((s) => s.toggleWanted);
  const clearWanted = useApp((s) => s.clearWanted);

  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState<Keyword | 'all'>('all');
  const [tier, setTier] = useState<TierFilter>('all');
  const [acquisition, setAcquisition] = useState<AcquisitionKind | 'all'>('all');
  const [conditionalOnly, setConditionalOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);

  const conditionByGift = useMemo(() => {
    const stats = analyseDeck(deck, indexes, data.rules.deployment);
    const reports = evaluateConditions(
      data.gifts.filter((gift) => gift.conditions.length > 0).map((gift) => gift.id),
      stats,
      indexes,
    );
    const map = new Map<number, ConditionReport[]>();
    for (const report of reports) {
      const list = map.get(report.giftId) ?? [];
      list.push(report);
      map.set(report.giftId, list);
    }
    return map;
  }, [deck, data, indexes]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.gifts
      .filter((gift) => gift.obtainable || wanted.includes(gift.id))
      .filter((gift) => (keyword === 'all' ? true : gift.keyword === keyword))
      .filter((gift) => (tier === 'all' ? true : String(gift.tier) === tier))
      .filter((gift) => (acquisition === 'all' ? true : gift.acquisition.kind === acquisition))
      .filter((gift) => (conditionalOnly ? gift.conditions.length > 0 : true))
      .filter((gift) => (selectedOnly ? wanted.includes(gift.id) : true))
      .filter((gift) => {
        if (needle.length === 0) return true;
        return `${gift.name.ko} ${gift.name.en}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const aSelected = wanted.includes(a.id) ? 0 : 1;
        const bSelected = wanted.includes(b.id) ? 0 : 1;
        return aSelected - bSelected || a.id - b.id;
      });
  }, [data, wanted, query, keyword, tier, acquisition, conditionalOnly, selectedOnly]);

  return (
    <Section
      title={`${t('giftsHeading', lang)} (${wanted.length})`}
      hint={t('giftsHint', lang)}
      actions={
        <Button onClick={clearWanted} disabled={wanted.length === 0} variant="ghost">
          {t('giftsClear', lang)}
        </Button>
      }
    >
      <div className="mb-3 space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('giftsSearchPlaceholder', lang)}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
        />
        <div className="flex flex-wrap gap-3">
          <Toggle
            label={t('filterKeyword', lang)}
            value={keyword}
            onChange={setKeyword}
            options={[
              { value: 'all' as const, label: t('filterAll', lang) },
              ...data.enums.keywords.map((entry) => ({ value: entry.id, label: pick(entry.name, lang) })),
            ]}
          />
          <Toggle
            label={t('filterTier', lang)}
            value={tier}
            onChange={setTier}
            options={[
              { value: 'all' as const, label: t('filterAll', lang) },
              ...(['1', '2', '3', '4', '5'] as const).map((value) => ({ value, label: value })),
            ]}
          />
          <Toggle
            label={t('filterAcquisition', lang)}
            value={acquisition}
            onChange={setAcquisition}
            options={[
              { value: 'all' as const, label: t('filterAll', lang) },
              ...(['general', 'packLimited', 'fusionOnly', 'event'] as const).map((value) => ({
                value,
                label: t(ACQUISITION_LABEL[value], lang),
              })),
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={conditionalOnly}
              onChange={(event) => setConditionalOnly(event.target.checked)}
            />
            {t('filterConditionalOnly', lang)}
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selectedOnly}
              onChange={(event) => setSelectedOnly(event.target.checked)}
            />
            {t('filterSelectedOnly', lang)}
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">{t('giftsNone', lang)}</p>
      ) : (
        <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
          {visible.slice(0, 200).map((gift) => (
            <li key={gift.id}>
              <GiftRow
                gift={gift}
                data={data}
                indexes={indexes}
                lang={lang}
                selected={wanted.includes(gift.id)}
                conditions={conditionByGift.get(gift.id) ?? []}
                onToggle={() => toggleWanted(gift.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {visible.length > 200 ? (
        <p className="mt-2 text-center text-xs text-stone-400">
          {lang === 'ko'
            ? `상위 200개만 표시 (${visible.length}개 일치)`
            : `showing 200 of ${visible.length}`}
        </p>
      ) : null}
    </Section>
  );
}

function GiftRow({
  gift,
  data,
  indexes,
  lang,
  selected,
  conditions,
  onToggle,
}: {
  gift: Gift;
  data: GameData;
  indexes: GameIndexes;
  lang: Lang;
  selected: boolean;
  conditions: ConditionReport[];
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unmet = conditions.some((report) => !report.satisfied);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        selected
          ? 'border-amber-500 bg-amber-500/10'
          : 'border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700'
      }`}
    >
      <div className="flex items-start gap-2 p-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={pick(gift.name, lang)}
          className="mt-1 shrink-0"
        />
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier={gift.tier} />
            <span className="text-sm font-medium">{pick(gift.name, lang)}</span>
            <KeywordChip keyword={gift.keyword} enums={data.enums} lang={lang} />
            <Chip tone={gift.acquisition.kind === 'packLimited' ? 'accent' : 'neutral'}>
              {t(ACQUISITION_LABEL[gift.acquisition.kind], lang)}
            </Chip>
            {gift.hardOnly ? <Chip tone="warn">{t('hardOnly', lang)}</Chip> : null}
            {conditions.length > 0 ? (
              <Chip tone={unmet ? 'bad' : 'good'}>
                {unmet ? t('conditionUnmet', lang) : t('conditionMet', lang)}
              </Chip>
            ) : null}
          </span>
          {gift.acquisition.exclusiveTo.length > 0 ? (
            <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
              {t('exclusiveTo', lang)}:{' '}
              {gift.acquisition.exclusiveTo
                .map((packId) => pick(indexes.packById.get(packId)?.name, lang))
                .filter(Boolean)
                .join(', ')}
            </span>
          ) : null}
          {conditions.map((report, index) => (
            <span
              key={index}
              className={`mt-1 block text-xs ${
                report.satisfied
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {conditionText(report, data.enums, lang)}
              {reachedTierText(report, lang) ? ` · ${reachedTierText(report, lang)}` : ''}
            </span>
          ))}
        </button>
      </div>

      {open ? (
        <div className="border-t border-stone-200 px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-stone-600 dark:border-stone-800 dark:text-stone-300">
          {renderEffect(gift.desc, data.enums, lang)}
          {gift.fusion && gift.fusion.recipes.length > 0 ? (
            <p className="mt-2 text-stone-500">
              {t('fusionRecipe', lang)}:{' '}
              {gift.fusion.recipes
                .map((recipe) =>
                  recipe.ingredients
                    .map((id) => pick(indexes.giftById.get(id)?.name, lang) || id)
                    .join(' + '),
                )
                .join(' / ')}
            </p>
          ) : null}
          {gift.notes ? (
            <p className="mt-2 text-amber-600 dark:text-amber-400">{pick(gift.notes, lang)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
