/**
 * UI tests for the pieces that carry real logic: share links, deck slots, and the way conditions
 * are put into words. Rendering the whole app needs a fetch of the generated data, so the route
 * view is covered by the planner tests and the browser smoke run instead.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadGameDataFromDisk } from '../../core/data/node.ts';
import { buildIndexes, evaluateConditions, analyseDeck } from '../../core/index.ts';
import { conditionText, reachedTierText } from '../condition-text.ts';
import { decodeShared, encodeShared, sinnerOf, useApp } from '../store.ts';
import { defaultOptions } from '../../core/index.ts';
import { DeckPanel } from '../DeckPanel.tsx';

const data = loadGameDataFromDisk();
const indexes = buildIndexes(data);

beforeEach(() => {
  useApp.setState({ deck: [], wanted: [], options: defaultOptions(), lang: 'ko', dark: true });
});

describe('share links', () => {
  it('round-trips a deck, a gift list and the options', () => {
    const state = {
      deck: [10101, 10403],
      wanted: [9283, 9088],
      options: { ...defaultOptions(), lastFloor: 10 as const, hardFromFloor: 1 },
    };
    const decoded = decodeShared(encodeShared(state));
    expect(decoded).toEqual(state);
  });

  it('ignores a hash that is not a share link', () => {
    expect(decodeShared('#other')).toBeNull();
    expect(decodeShared('#s=not-valid')).toBeNull();
  });
});

describe('deck store', () => {
  it('keeps one identity per sinner and orders the deck by sinner', () => {
    useApp.getState().setDeckSlot(4, 10403);
    useApp.getState().setDeckSlot(1, 10101);
    expect(useApp.getState().deck).toEqual([10101, 10403]);

    // Choosing another identity for the same sinner replaces the first.
    useApp.getState().setDeckSlot(4, 10408);
    expect(useApp.getState().deck.filter((id) => sinnerOf(id) === 4)).toEqual([10408]);
  });

  it('clears a slot when the identity is null', () => {
    useApp.getState().setDeckSlot(1, 10101);
    useApp.getState().setDeckSlot(1, null);
    expect(useApp.getState().deck).toEqual([]);
  });

  it('caps the deck at twelve identities', () => {
    const ids = data.identities.slice(0, 40).map((identity) => identity.id);
    useApp.getState().setDeck(ids);
    expect(useApp.getState().deck.length).toBeLessThanOrEqual(12);
  });
});

describe('condition wording', () => {
  const reportFor = (giftId: number, deck: number[]) =>
    evaluateConditions([giftId], analyseDeck(deck, indexes, data.rules.deployment), indexes)[0]!;

  it('names the faction in Korean instead of showing the raw id', () => {
    const report = reportFor(9283, [10101]);
    const text = conditionText(report, data.enums, 'ko');
    expect(text).toContain('엄지');
    expect(text).not.toContain('THUMB_FINGER');
    expect(text).toContain('0/3');
    expect(text).toContain('출격 인원');
  });

  it('names the keyword in Korean', () => {
    const report = reportFor(9088, [10101]);
    const text = conditionText(report, data.enums, 'ko');
    expect(text).toContain('화상');
    expect(text).not.toContain('Combustion');
  });

  it('falls back to English names for the English UI', () => {
    const report = reportFor(9283, [10101]);
    expect(conditionText(report, data.enums, 'en')).toMatch(/The Thumb|THUMB/i);
  });

  it('mentions a cleared enhancement tier only when the deck reaches it', () => {
    const tiered = data.gifts.find((gift) =>
      gift.conditions.some((condition) => 'tiers' in condition && condition.tiers.length > 0),
    );
    expect(tiered).toBeDefined();
    const emptyDeck = reportFor(tiered!.id, []);
    expect(reachedTierText(emptyDeck, 'ko')).toBeNull();
  });
});

describe('DeckPanel', () => {
  it('shows every sinner slot as empty to start with', () => {
    render(<DeckPanel data={data} indexes={indexes} lang="ko" />);
    expect(screen.getAllByText('비어 있음')).toHaveLength(12);
  });

  it('puts a chosen identity into its sinner slot', async () => {
    const user = userEvent.setup();
    render(<DeckPanel data={data} indexes={indexes} lang="ko" />);

    await user.click(screen.getByRole('button', { name: /료슈/ }));
    await user.click(screen.getByRole('button', { name: /흑운회 와카슈/ }));

    expect(useApp.getState().deck).toContain(10403);
    expect(screen.getAllByText('비어 있음')).toHaveLength(11);
  });

  it('reports a formation code it cannot read', async () => {
    const user = userEvent.setup();
    render(<DeckPanel data={data} indexes={indexes} lang="ko" />);

    await user.click(screen.getByRole('button', { name: '편성 코드 가져오기' }));
    await user.type(screen.getByLabelText(/편성 코드를 붙여넣으세요/), 'not-a-code');
    await user.click(screen.getByRole('button', { name: '불러오기' }));

    expect(await screen.findByText(/편성 코드를 읽을 수 없습니다/)).toBeInTheDocument();
    expect(useApp.getState().deck).toEqual([]);
  });
});
