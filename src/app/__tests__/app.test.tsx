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
import { appDefaultOptions, decodeShared, encodeShared, sinnerOf, useApp } from '../store.ts';
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
/** The six EXTREME clear rewards: five floors cannot hold them all, and none can be observed. */
const CLEAR_REWARDS = [9250, 9251, 9252, 9253, 9254, 9255];

const BURN_DECK = [10112, 10216, 10311, 10415, 10512, 10604, 10715, 10808, 10916, 11009, 11115, 11216];

beforeEach(() => {
  useApp.setState({ deck: [], deployed: [], wanted: [], priority: {}, options: appDefaultOptions(), lang: 'ko', dark: true, step: 1 });
});

describe('share links', () => {
  it('round-trips a deck, who is deployed, a gift list with priorities and the options', () => {
    const state = {
      deck: [10101, 10403],
      deployed: [10403],
      wanted: [9283, 9088],
      priority: { 9283: 'must' as const, 9088: 'skip' as const },
      options: { ...appDefaultOptions(), startKeyword: 'auto' as const },
    };
    const decoded = decodeShared(encodeShared(state));
    expect(decoded).toEqual(state);
  });

  it('plans every link for floors 1-15 on Hard and keeps priorities only for wanted gifts', () => {
    const old = lzString.compressToEncodedURIComponent(
      JSON.stringify({ v: 2, deck: [10101], deployed: [10101], wanted: [9283], priority: { 9283: 'must', 9088: 'skip', 9222: 'other' }, options: { ...defaultOptions(), lastFloor: 5, hardFromFloor: 3 } }),
    );
    const decoded = decodeShared(`#s=${old}`)!;
    expect(decoded.options).toMatchObject({ lastFloor: 15, hardFromFloor: 1 });
    expect(decoded.priority).toEqual({ 9283: 'must' });
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
    useApp.getState().applyShared({ deck: [10101], deployed: [10101], wanted: [9283], priority: {}, options: defaultOptions() });
    expect(useApp.getState().step).toBe(3);
    useApp.getState().applyShared({ deck: [10101], deployed: [10101], wanted: [], priority: {}, options: defaultOptions() });
    expect(useApp.getState().step).toBe(2);
    useApp.getState().applyShared({ deck: [], deployed: [], wanted: [], priority: {}, options: defaultOptions() });
    expect(useApp.getState().step).toBe(1);
  });

  it('consumes the hash once so a reload keeps later edits', async () => {
    window.location.hash = encodeShared({ deck: [10101], deployed: [10101], wanted: [9283], priority: {}, options: defaultOptions() });
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

  it('shows only the start keyword and a reset in the options bar, and always fifteen floor columns', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderRoute();
    expect(screen.getByRole('combobox', { name: '시작 키워드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '옵션 초기화' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Hard로 전환/ })).toBeNull();
    expect(screen.getByText('항상 1~15층 · Hard로 계획합니다')).toBeInTheDocument();
    const columns = screen.getByTestId('timetable-columns');
    const header = within(columns).getByText('15').parentElement!;
    expect(header.style.gridTemplateColumns).toBe('84px repeat(15, minmax(0, 1fr))');
    // Free floors after the last needed pack fold into one cell.
    expect(within(columns).getByText('자유 · 6~15층')).toBeInTheDocument();
  });

  it('keeps a stale saved floor range out of the plan', () => {
    useApp.getState().setOptions({ lastFloor: 5, hardFromFloor: 3 });
    useApp.getState().applyShared({ ...useApp.getState(), priority: {} });
    expect(useApp.getState().options).toMatchObject({ lastFloor: 15, hardFromFloor: 1 });
  });

  it('draws a pack that may sit on several floors as a window block whose length is its floor span', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    // 달궈진 놋쇠 → 화왕지절 (1402), Hard 4-5. Not in the observation pool, so it must be routed.
    useApp.getState().toggleWanted(9267);
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    expect(within(columns).queryAllByTestId('block-fixed')).toHaveLength(0);
    const block = within(columns).getByTestId('block-window');
    expect(block).toHaveTextContent('4~5 · 추천 4');
    // Start column + floors 4 and 5.
    expect(block.parentElement!.style.gridColumn).toBe('5 / span 2');
    expect(block.parentElement!.parentElement!.style.gridTemplateRows).toBe('repeat(1, 132px)');
    // The phone layout spans the same two floor rows, each a fixed 64px, with the labels in the grid.
    const rows = screen.getByTestId('timetable-rows');
    const grid = rows.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateRows).toBe('auto 40px 64px 64px 40px');
    expect(grid.querySelector(':scope > .absolute')).toBeNull();
    const label4 = within(rows).getAllByTestId('row-label').find((el) => el.textContent === '4')!;
    expect(label4.style.gridRow).toBe('3');
    expect(label4.style.gridColumn).toBe('1');
    expect(within(rows).getByTestId('block-window').parentElement!.style.gridRow).toBe('3 / span 2');
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

  it('offers an observation for an unresolved gift only while it is observable and a slot is free', () => {
    const conflict = (giftId: number) => ({ giftId, reason: 'pack-conflict' as const, detail: { ko: '', en: '' } });
    const free = appDefaultOptions();
    expect(actionsFor(conflict(9423), indexes.giftById.get(9423), free, data.rules)).toEqual([
      { kind: 'observeGift', giftId: 9423, patch: { observedGifts: [9423] } },
    ]);
    // EXTREME clear rewards cannot be observed.
    expect(actionsFor(conflict(9255), indexes.giftById.get(9255), free, data.rules)).toEqual([]);
    const full = { ...free, observedGifts: [9283, 9222, 9217] };
    expect(actionsFor(conflict(9423), indexes.giftById.get(9423), full, data.rules)).toEqual([{ kind: 'releaseObservations', patch: { observedGifts: [] } }]);
    expect(actionsFor(conflict(9283), indexes.giftById.get(9283), full, data.rules)).toEqual([]);
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

  it('keeps the grid still on hover and opens the block\'s details in a popover', async () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267); // 화왕지절, Hard 4-5
    renderRoute();
    const columns = screen.getByTestId('timetable-columns');
    const block = within(columns).getByRole('button', { name: /화왕지절 · 4~5층 중 · 기프트 1개 · 자세히/ });
    const body = block.parentElement!;
    const before = body.style.gridTemplateColumns;
    expect(before).toBe('84px repeat(15, minmax(0, 1fr))');
    fireEvent.pointerEnter(block);
    const popover = await within(columns).findByRole('dialog', { name: '화왕지절' });
    expect(body.style.gridTemplateColumns).toBe(before);
    expect(popover).toHaveTextContent('4~5층 중 한 층 · 추천 4');
    expect(popover).toHaveTextContent('달궈진 놋쇠');
    fireEvent.pointerLeave(block);
    await waitFor(() => expect(within(columns).queryByRole('dialog')).toBeNull());
    // Keyboard focus opens it at once and Escape closes it.
    fireEvent.focus(block);
    expect(within(columns).getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(columns).queryByRole('dialog')).toBeNull();
    // Pickups are icon tiles without names; the name is in the popover.
    expect(within(block).getByTestId('gift-icon')).toHaveAttribute('aria-label', expect.stringContaining('달궈진 놋쇠'));
    expect(within(block).getByTestId('pack-image')).toBeInTheDocument();
  });

  it('folds pickups past the cell\'s capacity into a +n chip', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9712, 9713, 9714, 9715, 9716]) useApp.getState().toggleWanted(id); // 육참골단, one block on 3~4
    renderRoute();
    const block = within(screen.getByTestId('timetable-columns')).getByTestId('block-window');
    expect(within(block).getAllByTestId('gift-icon')).toHaveLength(3);
    expect(within(block).getByTestId('block-more')).toHaveTextContent('+2');
    // A phone row is wider, so the same block shows every icon.
    const row = within(screen.getByTestId('timetable-rows')).getByTestId('block-window');
    expect(within(row).getAllByTestId('gift-icon')).toHaveLength(5);
    expect(within(row).queryByTestId('block-more')).toBeNull();
  });

  it('opens a bottom sheet from a phone block and from an observed tile', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    useApp.getState().toggleWanted(9423); // observable; the planner recommends observing it
    renderRoute();
    const rows = screen.getByTestId('timetable-rows');
    await user.click(within(rows).getByRole('button', { name: /기프트 1개 · 자세히/ }));
    const sheet = screen.getByTestId('block-sheet');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(sheet).toHaveTextContent('5층 고정');
    expect(sheet).toHaveTextContent('달궈진 놋쇠');
    await user.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByTestId('block-sheet')).toBeNull();
    // The start cell's tile explains the observation and pins it from the sheet.
    const tile = within(within(rows).getByTestId('start-cell')).getByTestId('observed-tile');
    await user.click(tile);
    const observed = screen.getByTestId('block-sheet');
    expect(observed).toHaveTextContent('변하지 않는 안 가도 됨');
    await user.click(within(observed).getByRole('button', { name: '깨진 안경 관측 지정 전환' }));
    expect(useApp.getState().options.observedGifts).toEqual([9423]);
  });

  it('marks a must-have gift with a star badge on its tile', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    useApp.getState().setPriority(9267, 'must');
    renderRoute();
    const icon = within(within(screen.getByTestId('timetable-columns')).getByTestId('block-window')).getByTestId('gift-icon');
    expect(icon).toHaveAttribute('data-must', 'true');
    expect(icon).toHaveAttribute('aria-label', expect.stringMatching(/^반드시 · /));
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
    expect(tile).toHaveAttribute('title', '깨진 안경 · 관측 · 변하지 않는 안 가도 됨');
    expect(tile.className).not.toContain('w-full');
    await user.click(tile);
    expect(useApp.getState().options.observedGifts).toEqual([9423]);
    expect(within(screen.getByTestId('timetable-columns')).getByTestId('observed-tile')).toHaveTextContent('지정');
  });

  it('offers alternative routes as tabs when the wanted gifts cannot all fit, and confirming one gives that gift up', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    // Six EXTREME clear rewards for five EXTREME floors; none can be observed.
    for (const id of CLEAR_REWARDS) useApp.getState().toggleWanted(id);
    renderRoute();
    expect(screen.getByTestId('unresolved')).toHaveTextContent('팩 충돌');
    expect(screen.getAllByTestId('unresolved-row')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '대안 루트 보기' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: '대안 루트' })).getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveTextContent('전부');
    expect(tabs[1]).toHaveTextContent('제외');
    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('unresolved')).toBeNull();
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('5/5');
    // Confirming keeps the gift selected but gives it up in the plan.
    await user.click(screen.getByRole('button', { name: '이 기프트 포기' }));
    expect(useApp.getState().wanted).toEqual(CLEAR_REWARDS);
    expect(Object.values(useApp.getState().priority)).toEqual(['skip']);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByTestId('skipped')).toHaveTextContent('포기한 기프트 1');
  });

  it('lets a must-have win the conflict and a given-up gift leave the plan until restored', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of CLEAR_REWARDS) useApp.getState().toggleWanted(id);
    renderRoute();
    const row = () => screen.getByTestId('unresolved-row');
    expect(row()).toHaveTextContent('박수 짝짝!');
    await user.click(within(row()).getByRole('button', { name: '박수 짝짝! 반드시 획득' }));
    expect(useApp.getState().priority).toEqual({ 9255: 'must' });
    // The must-have is now routed and another clear reward is the one left over.
    expect(row()).not.toHaveTextContent('박수 짝짝!');
    expect(row()).toHaveTextContent('한 잔 더!');
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('5/6');
    expect(screen.queryByText('포기 1')).toBeNull();
    await user.click(within(row()).getByRole('button', { name: '한 잔 더! 포기' }));
    expect(useApp.getState().priority).toEqual({ 9255: 'must', 9254: 'skip' });
    expect(screen.queryByTestId('unresolved-row')).toBeNull();
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('5/5');
    expect(screen.getByText('포기 1')).toBeInTheDocument();
    const skipped = screen.getByTestId('skipped');
    expect(skipped).toHaveTextContent('포기한 기프트 1');
    await user.click(within(skipped).getByRole('button', { name: '한 잔 더! 되돌리기' }));
    expect(useApp.getState().priority).toEqual({ 9255: 'must' });
    expect(row()).toHaveTextContent('한 잔 더!');
  });

  it('cycles a tray chip through 보통 → 반드시 → 포기 → 보통', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9283);
    useApp.getState().toggleObserved(9283, 3);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    await user.click(screen.getByRole('button', { name: '상납된 시가 우선순위: 보통' }));
    expect(useApp.getState().priority).toEqual({ 9283: 'must' });
    await user.click(screen.getByRole('button', { name: '상납된 시가 우선순위: 반드시' }));
    expect(useApp.getState().priority).toEqual({ 9283: 'skip' });
    // Giving a gift up releases its pinned observation.
    expect(useApp.getState().options.observedGifts).toEqual([]);
    await user.click(screen.getByRole('button', { name: '상납된 시가 우선순위: 포기' }));
    expect(useApp.getState().priority).toEqual({});
    // Deselecting a gift forgets its priority.
    useApp.getState().setPriority(9283, 'must');
    useApp.getState().toggleWanted(9283);
    expect(useApp.getState().priority).toEqual({});
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
    const marked = planToText(plan, (id) => indexes.giftById.get(id)?.name.ko ?? '', () => '', () => '', 'ko', [], { must: [9423], skipped: [9283] });
    expect(marked).toContain('깨진 안경 (반드시)');
    expect(marked.trim().split('\n').at(-1)).toBe('포기: 상납된 시가');
  });
});
