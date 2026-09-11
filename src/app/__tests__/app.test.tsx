/**
 * UI pieces with logic of their own: the store, share links, condition wording and the three
 * steps. Rendering uses the real generated data, like the planner tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import lzString from 'lz-string';
import userEvent from '@testing-library/user-event';
import { loadGameDataFromDisk } from '../../core/data/node.ts';
import { analyseDeck, buildIndexes, defaultOptions, evaluateConditions } from '../../core/index.ts';
import { conditionText, reachedTierText } from '../condition-text.ts';
import { decodeShared, encodeShared, sinnerOf, useApp } from '../store.ts';
import { classifyGift, prioritiseGifts } from '../lib/gift-priority.ts';
import { DeckStep } from '../steps/DeckStep.tsx';
import { GiftsStep } from '../steps/GiftsStep.tsx';
import { RouteStep } from '../steps/RouteStep.tsx';

const data = loadGameDataFromDisk();
const indexes = buildIndexes(data);
const statsFor = (deck: number[], deployed?: number[]) => analyseDeck(deck, indexes, data.rules.deployment, deployed);

/** A combustion-heavy formation, one identity per sinner. */
const BURN_DECK = [10112, 10216, 10311, 10415, 10512, 10604, 10715, 10808, 10916, 11009, 11115, 11216];

beforeEach(() => {
  useApp.setState({ deck: [], deployed: [], wanted: [], options: defaultOptions(), lang: 'ko', dark: true, step: 1 });
});

describe('share links', () => {
  it('round-trips a deck, who is deployed, a gift list and the options', () => {
    const state = {
      deck: [10101, 10403],
      deployed: [10403],
      wanted: [9283, 9088],
      options: { ...defaultOptions(), lastFloor: 10, hardFromFloor: 1 },
    };
    const decoded = decodeShared(encodeShared(state));
    expect(decoded).toEqual(state);
  });

  it('reads a v1 link without a deployed list as "the first six fight"', () => {
    const v1 =
      '#s=' +
      lzString.compressToEncodedURIComponent(
        JSON.stringify({ v: 1, deck: [10101, 10203, 10312, 10403, 10505, 10601, 10707], wanted: [], options: defaultOptions() }),
      );
    const decoded = decodeShared(v1);
    expect(decoded?.deck).toEqual([10101, 10203, 10312, 10403, 10505, 10601, 10707]);
    expect(decoded?.deployed).toEqual([10101, 10203, 10312, 10403, 10505, 10601]);
  });

  it('ignores a hash that is not a share link', () => {
    expect(decodeShared('#other')).toBeNull();
    expect(decodeShared('#s=not-valid')).toBeNull();
  });
});

describe('deck store', () => {
  it('keeps one identity per sinner and keeps the order the user built', () => {
    useApp.getState().setDeckSlot(4, 10403);
    useApp.getState().setDeckSlot(1, 10101);
    expect(useApp.getState().deck).toEqual([10403, 10101]);

    // Choosing another identity for the same sinner replaces it in place.
    useApp.getState().setDeckSlot(4, 10408);
    expect(useApp.getState().deck).toEqual([10408, 10101]);
    expect(useApp.getState().deck.filter((id) => sinnerOf(id) === 4)).toEqual([10408]);
  });

  it('deploys newcomers automatically until the default party is full', () => {
    for (const id of BURN_DECK.slice(0, 8)) useApp.getState().setDeckSlot(sinnerOf(id), id, 6);
    expect(useApp.getState().deployed).toEqual(BURN_DECK.slice(0, 6));
    // Replacing a deployed identity keeps the seat.
    useApp.getState().setDeckSlot(sinnerOf(BURN_DECK[0]!), 10115, 6);
    expect(useApp.getState().deployed[0]).toBe(10115);
  });

  it('clears a slot and its deployed seat when the identity is null', () => {
    useApp.getState().setDeckSlot(1, 10101);
    useApp.getState().toggleDeployed(10101, 7);
    expect(useApp.getState().deployed).toEqual([10101]);
    useApp.getState().setDeckSlot(1, null);
    expect(useApp.getState().deck).toEqual([]);
    expect(useApp.getState().deployed).toEqual([]);
  });

  it('caps deployment at the given maximum, in deck order', () => {
    useApp.getState().setDeck(BURN_DECK, 6);
    expect(useApp.getState().deployed).toEqual(BURN_DECK.slice(0, 6));
    useApp.getState().toggleDeployed(BURN_DECK[11]!, 7);
    expect(useApp.getState().deployed).toEqual([...BURN_DECK.slice(0, 6), BURN_DECK[11]]);
    // The eighth is refused.
    useApp.getState().toggleDeployed(BURN_DECK[7]!, 7);
    expect(useApp.getState().deployed).toHaveLength(7);
    // Un-deploying one makes room again, and order still follows the deck.
    useApp.getState().toggleDeployed(BURN_DECK[0]!, 7);
    useApp.getState().toggleDeployed(BURN_DECK[7]!, 7);
    expect(useApp.getState().deployed).toEqual([...BURN_DECK.slice(1, 6), BURN_DECK[7], BURN_DECK[11]]);
  });

  it('drops a lower-tier gift when its upgrade result is chosen', () => {
    useApp.getState().toggleWanted(9157);
    expect(useApp.getState().wanted).toEqual([9157]);
    useApp.getState().toggleWanted(9088, [9157]);
    expect(useApp.getState().wanted).toEqual([9088]);
  });
});

describe('gift priority', () => {
  it('groups gifts by how close the deployed party is to activating them', () => {
    const stats = statsFor(BURN_DECK, BURN_DECK.slice(0, 7));
    const reports = evaluateConditions([9088, 9092, 9208], stats, indexes);
    const byGift = new Map<number, typeof reports>();
    for (const r of reports) byGift.set(r.giftId, [...(byGift.get(r.giftId) ?? []), r]);
    const groups = prioritiseGifts([9088, 9092, 9208].map((id) => indexes.giftById.get(id)!), byGift);
    // 진혼 needs 5 combustion inflictors among the deployed 7 — every one of them qualifies.
    expect(groups.active.map((e) => e.gift.id)).toContain(9088);
    // 인연 얽힘 is a full-resonance condition: it cannot be judged from a deck.
    const resonance = groups.other.find((e) => e.gift.id === 9208);
    expect(resonance?.unjudgeable).toBe(true);
  });

  it('reads the shortfall off the worst condition', () => {
    const gift = indexes.giftById.get(9092)!; // 연성진동: 5 vibration inflictors
    const entry = classifyGift(gift, evaluateConditions([9092], statsFor([10216, 10512, 10916]), indexes));
    expect(entry.group).toBe('near');
    expect(entry.lack?.need).toBe(5);
    expect(entry.lack?.have).toBe(3);
  });
});

describe('condition wording', () => {
  const reportFor = (giftId: number, deck: number[]) => evaluateConditions([giftId], statsFor(deck), indexes)[0]!;

  it('names the faction in Korean instead of showing the raw id', () => {
    const report = reportFor(9283, [10101]);
    const text = conditionText(report, data.enums, 'ko');
    expect(text).not.toContain('THUMB_FINGER');
    expect(text).toContain('엄지');
  });

  it('says nothing about reached tiers when the deck reaches none', () => {
    const tiered = data.gifts.find((gift) => gift.conditions.some((c) => 'tiers' in c && c.tiers.length > 0));
    expect(tiered).toBeDefined();
    expect(reachedTierText(reportFor(tiered!.id, []), 'ko')).toBeNull();
  });
});

describe('DeckStep', () => {
  const renderDeck = () => {
    const { deck, deployed } = useApp.getState();
    return render(<DeckStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
  };

  it('shows twelve empty slots to start with', () => {
    renderDeck();
    expect(screen.getAllByText('인격 선택')).toHaveLength(12);
  });

  it('finds identities across every sinner from the global search', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.type(screen.getByLabelText(/전체 인격 검색/), '리우');
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(3);
    const sinners = new Set(options.map((o) => o.textContent?.slice(0, 2)));
    expect(sinners.size).toBeGreaterThan(1);
    await user.click(options[0]!);
    expect(useApp.getState().deck).toHaveLength(1);
  });

  it('refuses an eighth deployed identity', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    renderDeck();
    const boxes = screen.getAllByRole('checkbox', { name: /출격/ });
    expect(boxes).toHaveLength(12);
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(7);
    expect(boxes.filter((b) => (b as HTMLInputElement).disabled)).toHaveLength(5);
    expect(screen.getByText('7/7')).toBeInTheDocument();
  });

  it('reports a formation code it cannot read', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByRole('button', { name: '코드 가져오기' }));
    await user.type(screen.getByLabelText('편성 코드를 붙여넣으세요'), 'not-a-code');
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    expect(await screen.findByText('편성 코드를 읽을 수 없습니다')).toBeInTheDocument();
    expect(useApp.getState().deck).toEqual([]);
  });
});

describe('GiftsStep', () => {
  it('folds 요리 비법 전서 under 진혼 and marks it included once 진혼 is chosen', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    // 진혼 is active with this deck, so it sits in the first section with its child underneath.
    const child = screen.getAllByTestId('gift-child').find((el) => el.textContent?.includes('요리 비법 전서'));
    expect(child).toBeDefined();
    expect(child).toHaveTextContent('진혼 재료');
    expect(within(child!).queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: '진혼' }));
    expect(useApp.getState().wanted).toEqual([9088]);
    expect(screen.getAllByTestId('gift-child').find((el) => el.textContent?.includes('요리 비법 전서'))).toHaveTextContent('포함');
  });

  it('sends an empty deck back to step 1', () => {
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor([])} lang="ko" />);
    expect(screen.getByText('덱이 비어 있습니다')).toBeInTheDocument();
  });
});

describe('RouteStep', () => {
  const renderRoute = () => {
    const { deck, deployed } = useApp.getState();
    return render(<RouteStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
  };

  it('offers a one-way Hard switch that locks once used', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9283);
    renderRoute();
    await user.click(screen.getByRole('button', { name: 'Hard로 전환' }));
    expect(useApp.getState().options.hardFromFloor).toBe(1);
    expect(screen.getByTestId('hard-locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hard로 전환' })).toBeNull();
  });

  it('locks Hard automatically when the plan reaches 평행중첩', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9283);
    renderRoute();
    await user.click(screen.getByRole('radio', { name: '10' }));
    expect(useApp.getState().options).toMatchObject({ lastFloor: 10, hardFromFloor: 1 });
    expect(screen.getByTestId('hard-locked')).toBeInTheDocument();
  });

  it('draws a pack that may sit on several floors as a window block', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9423); // 변하지 않는 (1012), Hard 4-5
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    expect(within(columns).queryAllByTestId('block-fixed')).toHaveLength(0);
    expect(within(columns).getAllByTestId('block-window')).toHaveLength(1);
    expect(within(columns).getByText('4~5층 중 한 층 · 추천 4')).toBeInTheDocument();
  });

  it('collapses that window to a fixed block when another required pack takes floor 5', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9423);
    useApp.getState().toggleWanted(9208); // 해방된 분노 (1302), Hard 5 only
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    expect(within(columns).getAllByTestId('block-fixed')).toHaveLength(2);
    expect(within(columns).queryAllByTestId('block-window')).toHaveLength(0);
  });

  it('lets an unresolved entry change the options it needs', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9215); // 붉은색 넥타이: Hard only
    renderRoute();
    const card = screen.getByTestId('unresolved');
    expect(card).toHaveTextContent('Hard 전용');
    await user.click(within(card).getByRole('button', { name: /Hard로 전환/ }));
    expect(useApp.getState().options.hardFromFloor).toBe(1);
  });
});
