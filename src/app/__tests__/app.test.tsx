/**
 * UI pieces with logic of their own: the store, share links, condition wording and the three
 * steps. Rendering uses the real generated data, like the planner tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import lzString from 'lz-string';
import userEvent from '@testing-library/user-event';
import { loadGameDataFromDisk } from '../../core/data/node.ts';
import { analyseDeck, buildIndexes, defaultOptions, evaluateConditions } from '../../core/index.ts';
import { conditionText, josa, reachedTierText } from '../condition-text.ts';
import { decodeShared, encodeShared, sinnerOf, useApp } from '../store.ts';
import { classifyGift, prioritiseGifts } from '../lib/gift-priority.ts';
import { DeckStep } from '../steps/DeckStep.tsx';
import { GiftsStep } from '../steps/GiftsStep.tsx';
import { RouteStep } from '../steps/RouteStep.tsx';
import { App } from '../App.tsx';
import { planToText } from '../lib/plan-text.ts';
import { actionsFor } from '../lib/unresolved-actions.ts';
import { keywordName } from '../format.ts';
import { planRoute } from '../../core/index.ts';

vi.mock('../../core/data/load.ts', async () => {
  const { loadGameDataFromDisk } = await import('../../core/data/node.ts');
  return { loadGameData: async () => loadGameDataFromDisk() };
});

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

  it('drops option keys the planner no longer knows, such as the old observation count', () => {
    const stale = lzString.compressToEncodedURIComponent(
      JSON.stringify({ v: 2, deck: [10101], deployed: [10101], wanted: [9283], options: { ...defaultOptions(), giftObservationMax: 2, observedGifts: [9222, 9222] } }),
    );
    const decoded = decodeShared(`#s=${stale}`)!;
    expect('giftObservationMax' in decoded.options).toBe(false);
    expect(decoded.options.observedGifts).toEqual([9222]);
  });

  it('ignores a hash that is not a share link', () => {
    expect(decodeShared('#other')).toBeNull();
    expect(decodeShared('#s=not-valid')).toBeNull();
  });

  it('lands a recipient on the furthest step the link can show', () => {
    useApp.getState().applyShared({ deck: [10101], deployed: [10101], wanted: [9283], options: defaultOptions() });
    expect(useApp.getState().step).toBe(3);
    useApp.getState().applyShared({ deck: [10101], deployed: [10101], wanted: [], options: defaultOptions() });
    expect(useApp.getState().step).toBe(2);
    useApp.getState().applyShared({ deck: [], deployed: [], wanted: [], options: defaultOptions() });
    expect(useApp.getState().step).toBe(1);
  });

  it('consumes the hash once so a reload keeps later edits', async () => {
    window.location.hash = encodeShared({ deck: [10101], deployed: [10101], wanted: [9283], options: defaultOptions() });
    render(<App />);
    await waitFor(() => expect(useApp.getState().wanted).toEqual([9283]));
    expect(window.location.hash).toBe('');
    expect(useApp.getState().step).toBe(3);
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

  it('picks the object particle by the final consonant', () => {
    expect(josa('화상', '을/를')).toBe('화상을');
    expect(josa('연기', '을/를')).toBe('연기를');
    expect(josa('Burn', '을/를')).toBe('Burn을(를)');
    const report = reportFor(9088, BURN_DECK);
    expect(conditionText(report, data.enums, 'ko')).toMatch(/^화상을 부여하는/);
  });

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

  it('walks the search results with the keyboard and closes on Escape', async () => {
    const user = userEvent.setup();
    renderDeck();
    const input = screen.getByRole('combobox', { name: /전체 인격 검색/ });
    await user.type(input, '리우{ArrowDown}{Enter}');
    expect(useApp.getState().deck).toHaveLength(1);
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.type(input, '리우');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
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
  it('folds 요리 비법 전서 under 진혼, lets it be chosen alone, and marks it included once 진혼 is chosen', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    // 진혼 is active with this deck, so it sits in the first section with its child underneath.
    const findChild = () => screen.getAllByTestId('gift-child').find((el) => el.textContent?.includes('요리 비법 전서'))!;
    expect(findChild()).toBeDefined();
    // The child carries its own acquisition badge and can be wanted on its own.
    expect(findChild()).toHaveTextContent('조합');
    await user.click(within(findChild()).getByRole('checkbox', { name: '요리 비법 전서' }));
    expect(useApp.getState().wanted).toEqual([9157]);
    // Choosing the parent absorbs the child: it drops from the list and its box locks as "included".
    await user.click(screen.getByRole('checkbox', { name: '진혼' }));
    expect(useApp.getState().wanted).toEqual([9088]);
    expect(findChild()).toHaveTextContent('포함');
    expect(within(findChild()).getByRole('checkbox')).toBeDisabled();
  });

  it('counts rows, not the whole catalogue, in the virtual list label', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    await user.click(screen.getByRole('button', { name: /기타/ }));
    expect(screen.getByText(/행 중 1~/)).not.toHaveTextContent(String(data.gifts.length));
  });

  it('pins observations from the tray, up to the limit and only for observable gifts', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9283, 9222, 9217, 9435, 9751]) useApp.getState().toggleWanted(id);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    const eye = (name: string) => screen.getByRole('button', { name: `${name} 관측 지정` });
    expect(eye('상납된 시가')).toBeDisabled(); // not in the season's observation pool
    await user.click(eye('새하얀 캔버스'));
    await user.click(eye('누군가의 단말기'));
    await user.click(eye('버틀러식 포박술'));
    expect(useApp.getState().options.observedGifts).toEqual([9222, 9217, 9435]);
    expect(eye('뱀 허물')).toBeDisabled();
    expect(screen.getByText('관측 지정 3/3 · 나머지는 플래너가 추천')).toBeInTheDocument();
    await user.click(eye('새하얀 캔버스'));
    expect(useApp.getState().options.observedGifts).toEqual([9217, 9435]);
    // Deselecting a pinned gift drops its pin too.
    await user.click(screen.getByRole('button', { name: '누군가의 단말기 선택 해제' }));
    expect(useApp.getState().options.observedGifts).toEqual([9435]);
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
    // 달궈진 놋쇠 → 화왕지절 (1402), Hard 4-5. Not in the observation pool, so it must be routed.
    useApp.getState().toggleWanted(9267);
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    expect(within(columns).queryAllByTestId('block-fixed')).toHaveLength(0);
    expect(within(columns).getAllByTestId('block-window')).toHaveLength(1);
    expect(within(columns).getByText('4~5층 중 한 층 · 추천 4')).toBeInTheDocument();
  });

  it('collapses that window to a fixed block when another required pack takes floor 5', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9754); // 굴레 → 2호선 (1109), Hard 4-5, not observable
    useApp.getState().toggleWanted(9208); // 해방된 분노 (1302), Hard 5 only
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    expect(within(columns).getAllByTestId('block-fixed')).toHaveLength(2);
    expect(within(columns).queryAllByTestId('block-window')).toHaveLength(0);
  });

  it('lets an unresolved entry change the options it needs, once per shared action', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9215); // 붉은색 넥타이: Hard only
    useApp.getState().toggleWanted(9423); // 깨진 안경: Hard only
    renderRoute();
    const card = screen.getByTestId('unresolved');
    expect(card).toHaveTextContent('Hard 전용');
    expect(within(card).getAllByRole('button', { name: /Hard로 전환/ })).toHaveLength(1);
    await user.click(within(card).getByRole('button', { name: /Hard로 전환/ }));
    expect(useApp.getState().options.hardFromFloor).toBe(1);
  });

  it('extends the plan only as far as the missing pack needs', () => {
    const options = { ...defaultOptions(), lastFloor: 3, hardFromFloor: 1 };
    const entry = { giftId: 9423, reason: 'no-pack-in-range' as const, detail: { ko: '', en: '' } };
    const actions = actionsFor(entry, indexes.giftById.get(9423), indexes.packById, options, data.rules);
    const extend = actions.find((a) => a.kind === 'extendFloors')!;
    expect(extend.floor).toBe(5);
    expect(extend.patch).toEqual({ lastFloor: 5 });
  });

  it('marks a condition it cannot judge as such, not as unmet', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9208); // 인연 얽힘: full-resonance condition
    renderRoute();
    // The judgement sits on the icon border and its accessible name, in the condition card and
    // on the timetable tile alike.
    expect(screen.getAllByLabelText(/^판정 불가 · 인연 얽힘/).length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText(/^미충족/)).toHaveLength(0);
    const tile = within(screen.getByTestId('conditions')).getByTestId('gift-icon');
    expect(tile).toHaveAttribute('data-judgement', 'unknown');
  });

  it('colours a gift icon by whether the deck meets its condition', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9088); // 진혼: combustion condition this deck meets
    useApp.getState().toggleWanted(9211); // 먹장구름: sinking condition it does not
    renderRoute();
    const card = screen.getByTestId('conditions');
    const byName = (name: RegExp) => within(card).getByLabelText(name);
    expect(byName(/^충족 · 진혼/)).toHaveAttribute('data-judgement', 'met');
    expect(byName(/^미충족 · 먹장구름/)).toHaveAttribute('data-judgement', 'unmet');
  });

  it('shows only the two block kinds in the legend and no starlight, fusion or general-drop text', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9088); // a fusion result, which used to produce a recipe card
    useApp.getState().toggleWanted(9267);
    renderRoute();
    const legend = screen.getByTestId('legend');
    expect(legend.querySelectorAll(':scope > span')).toHaveLength(2);
    expect(legend).toHaveTextContent('이 층 고정');
    expect(legend).toHaveTextContent('이 중 한 층');
    for (const text of ['별빛', '합성', '범용 드랍', '나올 수 있음', '관측 최대']) expect(screen.queryByText(new RegExp(text))).toBeNull();
  });

  it('widens the hovered block\'s floors so its contents are not cut off', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9267); // 화왕지절, Hard 4-5
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    const block = within(columns).getByTestId('block-window').parentElement!;
    const body = block.parentElement!;
    expect(body.style.gridTemplateColumns).not.toContain('2.2fr');
    fireEvent.pointerEnter(block);
    const tracks = body.style.gridTemplateColumns.match(/\d+px|minmax\([^)]*\)/g)!;
    // start + 5 floors + the folded out-of-range column
    expect(tracks).toHaveLength(7);
    expect(tracks[4]).toBe('minmax(0, 2.2fr)');
    expect(tracks[5]).toBe('minmax(0, 2.2fr)');
    expect(tracks[1]).toBe('minmax(0, 1fr)');
    fireEvent.pointerLeave(block);
    expect(body.style.gridTemplateColumns).not.toContain('2.2fr');
    // Each pickup is an icon tile with the gift name under it.
    expect(within(block).getByLabelText(/달궈진 놋쇠/)).toBeInTheDocument();
    expect(within(block).getByTestId('pack-image')).toBeInTheDocument();
  });

  it('shows recommended observations in the start cell and lets one be pinned', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    useApp.getState().toggleWanted(9423); // observable; observing it frees 변하지 않는
    renderRoute();
    const cell = within(screen.getByTestId('timetable-columns')).getByTestId('start-cell');
    const tile = within(cell).getByTestId('observed-tile');
    expect(tile).toHaveTextContent('추천');
    expect(tile).toHaveAttribute('title', expect.stringContaining('변하지 않는 안 가도 됨'));
    await user.click(tile);
    expect(useApp.getState().options.observedGifts).toEqual([9423]);
    expect(within(screen.getByTestId('timetable-columns')).getByTestId('observed-tile')).toHaveTextContent('지정');
  });

  it('offers alternative routes as tabs when the wanted gifts cannot all fit', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setOptions({ hardFromFloor: 1 });
    for (const id of [9283, 9222, 9217, 9435, 9751]) useApp.getState().toggleWanted(id);
    renderRoute();
    expect(screen.getByTestId('unresolved')).toHaveTextContent('팩 충돌');
    const tabs = within(screen.getByRole('tablist', { name: '대안 루트' })).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent('전부');
    expect(tabs[1]).toHaveTextContent('상납된 시가 제외');
    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('unresolved')).toBeNull();
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('4/4');
    // Confirming drops the gift from the wanted list for good.
    await user.click(screen.getByRole('button', { name: '이 기프트 빼고 확정' }));
    expect(useApp.getState().wanted).toEqual([9217, 9222, 9435, 9751]);
  });

  it('keeps a valid column template when the plan reaches floor 15', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderRoute();
    await user.click(screen.getByRole('radio', { name: '15' }));
    const grids = screen.getByTestId('timetable-columns').querySelectorAll<HTMLElement>('.grid');
    for (const grid of grids) expect(grid.style.gridTemplateColumns).not.toContain('repeat(0');
    // Free floors 5-15 fold into one cell instead of eleven.
    expect(within(screen.getByTestId('timetable-columns')).getByText('자유 · 6~15층')).toBeInTheDocument();
  });

  it('copies the plan with localized names instead of raw ids', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    const plan = planRoute(
      { deck: BURN_DECK, wanted: [{ giftId: 9423, required: true }], options: { ...defaultOptions(), hardFromFloor: 1 } },
      data,
      indexes,
    );
    const text = planToText(
      plan,
      (id) => indexes.giftById.get(id)?.name.ko ?? '',
      (id) => indexes.packById.get(id)?.name.ko ?? '',
      (id) => keywordName(id, data.enums, 'ko'),
      'ko',
    );
    expect(text).not.toContain('Combustion');
    expect(text).not.toContain('(hard)');
    expect(text).toContain('시작: 화상');
    expect(text).toContain('(Hard)');
    expect(text).toContain('관측: 깨진 안경 (추천)');
    for (const word of ['별빛', '조합', '범용']) expect(text).not.toContain(word);
    const without = planToText(plan, (id) => indexes.giftById.get(id)?.name.ko ?? '', () => '', () => '', 'ko', [9283]);
    expect(without.split('\n')[0]).toBe('상납된 시가 제외');
  });
});
