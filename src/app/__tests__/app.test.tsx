/**
 * UI pieces with logic of their own: the store, share links, condition wording, the setup tabs,
 * the run stage and the side panels. Rendering uses the real generated data, like the planner
 * tests. jsdom has no matchMedia, so the shell renders as a phone unless a test stubs it.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import lzString from 'lz-string';
import userEvent from '@testing-library/user-event';
import { loadGameDataFromDisk } from '../../core/data/node.ts';
import { analyseDeck, buildIndexes, defaultOptions, evaluateConditions } from '../../core/index.ts';
import { conditionText, josa, reachedTierText } from '../condition-text.ts';
import { appDefaultOptions, decodeShared, defaultUi, emptyRun, encodeShared, sanitizeOptions, sanitizeRun, sinnerOf, useApp } from '../store.ts';
import { planInputFor } from '../lib/plan-input.ts';
import { classifyGift, prioritiseGifts } from '../lib/gift-priority.ts';
import { defaultDeck } from '../lib/default-deck.ts';
import { DeckStep } from '../steps/DeckStep.tsx';
import { GiftsStep } from '../steps/GiftsStep.tsx';
import { App } from '../App.tsx';
import { AppShell } from '../shell/AppShell.tsx';
import { PlanProvider } from '../shell/PlanContext.tsx';
import { RoutePlanPanel } from '../shell/RoutePlanPanel.tsx';
import { RouteSettings } from '../shell/RouteSettings.tsx';
import { RunStage } from '../stage/RunStage.tsx';
import { Tracker } from '../tracker/Tracker.tsx';
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
  useApp.setState({ deck: [], deployed: [], wanted: [], priority: {}, fusionGoal: {}, run: emptyRun(), ui: defaultUi(), options: appDefaultOptions(), lang: 'ko', dark: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render a piece of the shell with the plan computed from the store, as the shell does. */
const renderPlanned = (node: ReactNode, override?: typeof data) => {
  const { deck, deployed } = useApp.getState();
  return render(
    <PlanProvider data={override ?? data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko">
      {node}
    </PlanProvider>,
  );
};

/** Pretend the viewport is a desktop (or not); jsdom has no matchMedia of its own. */
const stubMatchMedia = (desktop: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: desktop, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
};

describe('share links', () => {
  it('round-trips a deck, who is deployed, a gift list with priorities and the options', () => {
    const state = {
      deck: [10101, 10403],
      deployed: [10403],
      wanted: [9283, 9088],
      priority: { 9283: 'must' as const, 9088: 'skip' as const },
      fusionGoal: { 9088: 'resultOnly' as const },
      options: { ...appDefaultOptions(), startKeyword: 'auto' as const },
    };
    const decoded = decodeShared(encodeShared(state));
    expect(decoded).toEqual(state);
  });

  it('carries fusion goals but never the run in progress, and strips run options from any link', () => {
    useApp.getState().visitPack(1402, 4, { got: [9283] });
    const hash = encodeShared({ deck: [10101], deployed: [10101], wanted: [9088], priority: {}, fusionGoal: { 9088: 'resultOnly' }, options: { ...appDefaultOptions(), currentFloor: 4, ownedGifts: [9283] } });
    const raw = JSON.parse(lzString.decompressFromEncodedURIComponent(hash.slice(3))!) as Record<string, unknown>;
    expect(raw.v).toBe(4);
    expect('run' in raw).toBe(false);
    expect(raw.fusionGoal).toEqual({ 9088: 'resultOnly' });
    const decoded = decodeShared(hash)!;
    expect(decoded.fusionGoal).toEqual({ 9088: 'resultOnly' });
    expect(decoded.options).toMatchObject({ currentFloor: 1, ownedGifts: [], unobtainableGifts: [] });
    expect(sanitizeOptions({ currentFloor: 9, unobtainableGifts: [1] })).toMatchObject({ currentFloor: 1, unobtainableGifts: [] });
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

  it('starts a recipient on a fresh run, whatever this device had recorded', () => {
    useApp.getState().visitPack(1402, 4);
    useApp.getState().setGiftStatus(9267, 'got');
    useApp.getState().applyShared({ deck: [10101], deployed: [10101], wanted: [9283], priority: {}, options: defaultOptions() });
    expect(useApp.getState().run).toEqual(emptyRun());
    expect(useApp.getState().wanted).toEqual([9283]);
  });

  it('consumes the hash once so a reload keeps later edits', async () => {
    window.location.hash = encodeShared({ deck: [10101], deployed: [10101], wanted: [9283], priority: {}, options: defaultOptions() });
    render(<App />);
    await waitFor(() => expect(useApp.getState().wanted).toEqual([9283]));
    expect(window.location.hash).toBe('');
  });
});

describe('run store', () => {
  it('tracks visits and gift status, feeds them to the planner, and clears on a new run', () => {
    useApp.getState().setDeck([10101], 6);
    useApp.getState().toggleWanted(9249);
    expect(useApp.getState().run).toMatchObject({ currentFloor: 1, stageFloor: 1 });
    useApp.getState().visitPack(1016, 1, { got: [9222] });
    expect(useApp.getState().run).toMatchObject({ visits: { 1: 1016 }, currentFloor: 2, stageFloor: 1, giftStatus: { 9222: 'got' } });
    // A pack is entered once per run: a new floor replaces the old one.
    useApp.getState().visitPack(1016, 3);
    expect(useApp.getState().run.visits).toEqual({ 3: 1016 });
    expect(useApp.getState().run.currentFloor).toBe(4);
    useApp.getState().setGiftStatus(9431, 'failed');
    useApp.getState().setFusionGoal(9249, 'resultOnly');
    const input = planInputFor(useApp.getState());
    expect(input.options).toMatchObject({ currentFloor: 4, pinnedPacks: { 3: 1016 }, ownedGifts: [9222], unobtainableGifts: [9431] });
    expect(input.wanted).toEqual([{ giftId: 9249, required: false, ingredientsAsGoals: false }]);
    // Undoing an entry can take the statuses recorded for that pack's own drops with it.
    useApp.getState().setGiftStatus(9267, 'got');
    useApp.getState().unvisitPack(1016, { reset: [9267, 9431] });
    expect(useApp.getState().run.visits).toEqual({});
    expect(useApp.getState().run.giftStatus).toEqual({ 9222: 'got' });
    useApp.getState().resetRun();
    expect(useApp.getState().run).toEqual(emptyRun());
    expect(planInputFor(useApp.getState()).options).toMatchObject({ currentFloor: 1, ownedGifts: [], pinnedPacks: {} });
  });

  it('walks the floors: entering, skipping, looking back, and taking a decision back', () => {
    const run = () => useApp.getState().run;
    // Floor 1 undecided → skipped; the frontier moves with the stage.
    useApp.getState().nextFloor({ got: [9423] });
    expect(run()).toMatchObject({ currentFloor: 2, stageFloor: 2, giftStatus: { 9423: 'got' } });
    // Entering keeps the stage on the entered floor so its gifts can be marked.
    useApp.getState().visitPack(1008, 2, { got: [9415] });
    expect(run()).toMatchObject({ currentFloor: 3, stageFloor: 2, visits: { 2: 1008 }, giftStatus: { 9423: 'got', 9415: 'got' } });
    // Leaving an entered floor never skips: the frontier is already past it; a recorded gift is never overridden by a miss.
    useApp.getState().nextFloor({ failed: [9415, 9419] });
    expect(run()).toMatchObject({ currentFloor: 3, stageFloor: 3, giftStatus: { 9423: 'got', 9415: 'got', 9419: 'failed' } });
    useApp.getState().nextFloor();
    expect(run()).toMatchObject({ currentFloor: 4, stageFloor: 4 });
    // Stepping back onto the skip right before the frontier takes it back, but not an older one.
    useApp.getState().setStageFloor(3);
    expect(run()).toMatchObject({ currentFloor: 3, stageFloor: 3 });
    useApp.getState().setStageFloor(2);
    expect(run()).toMatchObject({ currentFloor: 3, stageFloor: 2 });
    useApp.getState().setStageFloor(9); // never past the frontier
    expect(run().stageFloor).toBe(3);
    // Undoing the last decided visit reopens that floor; undoing an older one leaves a skip.
    useApp.getState().visitPack(1402, 3);
    useApp.getState().visitPack(1109, 4);
    expect(run()).toMatchObject({ currentFloor: 5, stageFloor: 3 });
    useApp.getState().unvisitPack(1109);
    expect(run()).toMatchObject({ currentFloor: 4, visits: { 2: 1008, 3: 1402 } });
    useApp.getState().unvisitPack(1008);
    expect(run()).toMatchObject({ currentFloor: 4, visits: { 3: 1402 } });
    useApp.getState().resetRun();
    expect(run()).toMatchObject({ currentFloor: 1, stageFloor: 1, visits: {}, giftStatus: {} });
  });

  it('keeps a saved run only where it still makes sense', () => {
    expect(sanitizeRun({ visits: { 2: 1102, 5: 1102, 99: 1016, x: 1 }, giftStatus: { 9431: 'failed', 9706: 'odd' }, currentFloor: 1, stageFloor: 7 })).toEqual({
      currentFloor: 3,
      stageFloor: 3,
      visits: { 2: 1102 },
      giftStatus: { 9431: 'failed' },
    });
    expect(sanitizeRun({ currentFloor: 20, stageFloor: 20, visits: {}, giftStatus: {} })).toMatchObject({ currentFloor: 16, stageFloor: 15 });
    // A record saved before the run-first shell, while no run was on: nothing to keep.
    expect(sanitizeRun({ active: false, visits: { 2: 1102 } })).toEqual(emptyRun());
    expect(sanitizeRun({ active: true, visits: { 2: 1102 }, currentFloor: 3 })).toMatchObject({ visits: { 2: 1102 }, currentFloor: 3, stageFloor: 3 });
    expect(sanitizeRun(null)).toEqual(emptyRun());
  });

  it('keeps a fusion goal only for a wanted gift', () => {
    useApp.getState().setFusionGoal(9249, 'resultOnly');
    expect(useApp.getState().fusionGoal).toEqual({});
    useApp.getState().toggleWanted(9249);
    useApp.getState().setFusionGoal(9249, 'resultOnly');
    expect(useApp.getState().fusionGoal).toEqual({ 9249: 'resultOnly' });
    useApp.getState().toggleWanted(9249); // deselecting drops the goal setting
    expect(useApp.getState().fusionGoal).toEqual({});
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

  it('shows twelve empty slots to start with and fills them with the LCB deck on request', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(screen.getAllByText('인격 선택')).toHaveLength(12);
    await user.click(screen.getByRole('button', { name: '기본 덱' }));
    expect(useApp.getState().deck).toEqual(defaultDeck(data));
    expect(useApp.getState().deck).toHaveLength(12);
    expect(useApp.getState().deployed).toHaveLength(6);
    expect(new Set(useApp.getState().deck.map((id) => indexes.identityById.get(id)!.title.ko))).toEqual(new Set(['LCB 수감자']));
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

  it('walks the search results with the keyboard, keeps the list up while picking, and closes on Escape', async () => {
    const user = userEvent.setup();
    renderDeck();
    const input = screen.getByRole('combobox', { name: /전체 인격 검색/ });
    await user.type(input, '리우{ArrowDown}{Enter}');
    expect(useApp.getState().deck).toHaveLength(1);
    // The query and the list survive a pick, so the next one is a click away.
    expect((input as HTMLInputElement).value).toBe('리우');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('takes several identities from one search and drops one by pressing it again', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.type(screen.getByLabelText(/전체 인격 검색/), 'LCB');
    const options = () => within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options()).toHaveLength(12);
    for (const i of [0, 1, 2]) await user.click(options()[i]!);
    expect(useApp.getState().deck).toHaveLength(3);
    expect(screen.getByText('덱에 3명')).toBeInTheDocument();
    expect(options()[0]).toHaveAttribute('aria-pressed', 'true');
    expect(options()[3]).toHaveAttribute('aria-pressed', 'false');
    await user.click(options()[0]!);
    expect(useApp.getState().deck).toHaveLength(2);
    expect(options()[0]).toHaveAttribute('aria-pressed', 'false');
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
  const renderGifts = () => {
    const { deck, deployed } = useApp.getState();
    return render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
  };
  const tile = (id: number) => screen.getAllByTestId('gift-tile').find((el) => el.getAttribute('data-gift') === String(id))!;

  it('folds 요리 비법 전서 under 진혼, lets it be chosen alone, and locks it once 진혼 is chosen', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    renderGifts();
    // 진혼 is active with this deck, so it sits in the first section with its child right after it.
    expect(tile(9157)).toBeDefined();
    const order = screen.getAllByTestId('gift-tile').map((el) => el.getAttribute('data-gift'));
    expect(order.indexOf('9157')).toBeGreaterThan(order.indexOf('9088'));
    await user.click(within(tile(9157)).getByRole('button', { name: '요리 비법 전서' }));
    expect(useApp.getState().wanted).toEqual([9157]);
    // Choosing the parent absorbs the child: its tile locks and reads as chosen.
    await user.click(within(tile(9088)).getByRole('button', { name: '진혼' }));
    expect(useApp.getState().wanted).toEqual([9088]);
    expect(tile(9157)).toHaveAttribute('data-locked');
    const childButton = within(tile(9157)).getByRole('button', { name: '요리 비법 전서' });
    expect(childButton).toBeDisabled();
    expect(childButton).toHaveAttribute('aria-pressed', 'true');
    // The tiles carry no acquisition badges or tier text any more; the tier stays on the icon.
    expect(within(tile(9088)).queryByText('조합')).toBeNull();
    expect(within(tile(9157)).queryByText('포함')).toBeNull();
    const tiers = within(tile(9088)).getAllByText('T4'); // the tier survives only as the icon's corner chip
    expect(tiers).toHaveLength(1);
    expect(within(tile(9088)).getByTestId('gift-icon')).toContainElement(tiers[0]!);
  });

  it('shows the deciding condition as a count and folds every section', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    renderGifts();
    // 진혼 needs 5 화상 identities and the burn deck has 7; 연성진동 wants 5 진동 and is short.
    expect(tile(9088)).toHaveTextContent('화상 7/5');
    expect(tile(9092)).toHaveTextContent('진동 3/5');
    // Every header folds, not just 「기타」 (which starts folded).
    for (const name of [/지금 덱으로 활성/, /거의 활성/]) {
      const header = screen.getByRole('button', { name, expanded: true });
      await user.click(header);
      expect(screen.getByRole('button', { name, expanded: false })).toBeInTheDocument();
    }
    expect(screen.queryByTestId('gift-tile')).toBeNull();
    await user.click(screen.getByRole('button', { name: /기타/, expanded: false }));
    expect(tile(9717)).toBeDefined();
  });

  it('marks two goals that eat the same ingredient as 얽힘 and names it in the sheet', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    // 장관 and 부동 are both fused from 녹슨 칼자루, so the shop cannot serve both from one pickup.
    for (const id of [9717, 9718]) useApp.getState().toggleWanted(id);
    renderGifts();
    await user.click(screen.getByRole('button', { name: /기타/, expanded: false }));
    expect(tile(9717)).toHaveAttribute('data-entangled');
    expect(tile(9718)).toHaveAttribute('data-entangled');
    await user.click(within(tile(9717)).getByRole('button', { name: '장관 자세히' }));
    expect(screen.getByTestId('gift-entangled')).toHaveTextContent('부동');
    expect(screen.getByTestId('gift-entangled')).toHaveTextContent('녹슨 칼자루');
  });

  it('opens a gift sheet with its effect, conditions and a recipe that starts folded', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    renderGifts();
    await user.click(within(tile(9088)).getByRole('button', { name: '진혼 자세히' }));
    const sheet = screen.getByTestId('gift-detail');
    expect(sheet).toHaveTextContent('조합');
    expect(within(sheet).getByTestId('gift-conditions')).toHaveTextContent('화상 7/5');
    expect(within(sheet).getByTestId('gift-conditions')).toHaveTextContent('부여하는 공격 스킬 보유 인격');
    // The recipe is behind a fold, and opening it lists the ingredients the planner would use.
    const recipe = within(sheet).getByTestId('gift-recipe');
    expect(recipe).not.toHaveAttribute('open'); // folded until asked for
    await user.click(within(recipe).getByText('조합식'));
    expect(recipe).toHaveAttribute('open');
    expect(within(recipe).getAllByTestId('recipe-item').length).toBeGreaterThan(1);
    expect(recipe).toHaveTextContent('요리 비법 전서');
    // The sheet can take the gift as a goal, and only then offers the ingredient question.
    expect(within(sheet).queryByRole('checkbox')).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: '목표로 삼기' }));
    expect(useApp.getState().wanted).toEqual([9088]);
    expect(within(sheet).getByRole('checkbox', { name: /재료도 목표/ })).toBeChecked();
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

  it('points an empty deck at the deck tab only when it is given somewhere to go', async () => {
    const user = userEvent.setup();
    const onGoDeck = vi.fn();
    const { unmount } = render(<GiftsStep data={data} indexes={indexes} stats={statsFor([])} lang="ko" />);
    expect(screen.getByText('덱이 비어 있습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '덱 탭으로' })).toBeNull();
    unmount();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor([])} lang="ko" onGoDeck={onGoDeck} />);
    await user.click(screen.getByRole('button', { name: '덱 탭으로' }));
    expect(onGoDeck).toHaveBeenCalledTimes(1);
  });

  it('lets a chosen fusion result decide whether its ingredients are goals too', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9249);
    const { deck, deployed } = useApp.getState();
    render(<GiftsStep data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" />);
    await user.type(screen.getByRole('textbox', { name: '기프트 검색' }), '조그맣고');
    await user.click(screen.getByRole('button', { name: /기타/, expanded: false }));
    await user.click(screen.getByRole('button', { name: '조그맣고 근사한 바이올린 자세히' }));
    await user.click(within(screen.getByTestId('gift-recipe')).getByText('조합식'));
    const box = screen.getByRole('checkbox', { name: '조그맣고 근사한 바이올린 재료도 목표' });
    expect(box).toBeChecked();
    await user.click(box);
    expect(useApp.getState().fusionGoal).toEqual({ 9249: 'resultOnly' });
    await user.click(box);
    expect(useApp.getState().fusionGoal).toEqual({});
  });
});


describe('RouteSettings', () => {
  it('shows the start keyword, the pinned observations and the pack choices, and resets each', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9267, 9423]) useApp.getState().toggleWanted(id); // one observable gift among the goals
    useApp.getState().banPack(1402);
    renderPlanned(<RouteSettings />);
    expect(screen.getByRole('combobox', { name: '시작 키워드' })).toBeInTheDocument();
    expect(screen.getByText('항상 1~15층 · Hard로 계획합니다')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    // Only the observable goal is listed, and pinning it takes a slot.
    const observed = screen.getByTestId('settings-observed');
    expect(within(observed).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(observed).getByRole('button', { name: '깨진 안경 관측 지정 전환' }));
    expect(useApp.getState().options.observedGifts).toEqual([9423]);
    expect(observed).toHaveTextContent('1/3');
    // The given-up pack is listed with its restore action.
    const packs = screen.getByTestId('settings-packs');
    expect(within(packs).getByTestId('settings-pack')).toHaveAttribute('data-pack', '1402');
    await user.click(within(packs).getByRole('button', { name: '화왕지절 되돌리기' }));
    expect(useApp.getState().options.bannedPacks).toEqual([]);
    await user.click(screen.getByRole('button', { name: '옵션 초기화' }));
    expect(useApp.getState().options.observedGifts).toEqual([]);
    // A new run clears the record after a confirmation.
    useApp.getState().visitPack(1402, 4);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '새 런' }));
    expect(useApp.getState().run).toEqual(emptyRun());
  });
});

describe('RoutePlanPanel', () => {
  const renderRoute = () => renderPlanned(<RoutePlanPanel onOpenGifts={() => undefined} />);
  const rows = () => screen.getByTestId('metro-rows');
  /** Spend all three observation slots on other gifts so observable fixtures get routed. */
  const fillObservations = () => {
    for (const id of [9435, 9222, 9217]) useApp.getState().toggleWanted(id);
    useApp.getState().setOptions({ observedGifts: [9435, 9222, 9217] });
  };

  it('shows an empty state without goals and fifteen stations on the vertical line with them', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    const { unmount } = renderRoute();
    expect(screen.getByTestId('route-empty')).toHaveTextContent('기프트를 고르면 루트가 나옵니다');
    unmount();
    useApp.getState().toggleWanted(9267);
    renderRoute();
    expect(screen.queryByTestId('metro-columns')).toBeNull();
    expect(within(rows()).getAllByTestId('station')).toHaveLength(15);
    expect(screen.getByTestId('route-summary')).toHaveTextContent('필요 팩');
  });

  it('draws a pack that may sit on several floors as one dashed segment with no suggested floor', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267); // 화왕지절, Hard 4-5, not observable
    renderRoute();
    const segment = within(rows()).getByTestId('segment');
    expect(segment).toHaveAttribute('data-from', '4');
    expect(segment).toHaveAttribute('data-to', '5');
    expect(segment).not.toHaveAttribute('data-partial');
    expect(segment).toHaveTextContent('4~5층 중 한 층');
    expect(within(segment).getByRole('button', { name: '화왕지절' })).toBeInTheDocument();
    expect(within(rows()).queryByTestId('suggested')).toBeNull();
    expect(segment.style.height).toBe(`${64 * 2 - 8}px`);
  });

  it('draws two fixed packs as solid blocks over their stations', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9754); // 2호선 (1109), Hard 4-5, not observable
    useApp.getState().toggleWanted(9208); // 해방된 분노 (1302), Hard 5 only
    renderRoute();
    const segments = within(rows()).getAllByTestId('segment');
    expect(segments.map((s) => [s.getAttribute('data-from'), s.getAttribute('data-to')])).toEqual([
      ['4', '4'],
      ['5', '5'],
    ]);
    expect(segments[0]).toHaveTextContent('4층 고정');
  });

  it('keeps partly overlapping windows on separate lanes with suggested stops and a half-filled station', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9415, 9427]) useApp.getState().toggleWanted(id); // 2-3 and 3-4
    fillObservations();
    renderRoute();
    const segments = within(rows()).getAllByTestId('segment');
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.hasAttribute('data-partial'))).toBe(true);
    expect(new Set(segments.map((s) => s.getAttribute('data-lane'))).size).toBe(2);
    expect(within(rows()).getAllByTestId('suggested').map((c) => c.getAttribute('data-floor'))).toEqual(['2', '3']);
    const overlapped = within(rows()).getAllByTestId('station').filter((el) => el.hasAttribute('data-overlap'));
    expect(overlapped.map((el) => el.getAttribute('data-floor'))).toEqual(['3']);
    expect(segments[0]).toHaveTextContent('2~3층 · 추천 2');
  });

  it('rides packs with identical windows on one segment and lists every name', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9415, 9419]) useApp.getState().toggleWanted(id); // both Hard 2-3
    fillObservations();
    renderRoute();
    const segment = within(rows()).getByTestId('segment');
    expect(segment).toHaveTextContent('2~3층 · 2팩 · 어느 층이든');
    expect(within(segment).getAllByTestId('segment-pack')).toHaveLength(2);
    expect(within(rows()).queryByTestId('suggested')).toBeNull();
  });

  it('shows six legend items and no starlight, fusion or general-drop text', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderRoute();
    expect(screen.getByTestId('legend').querySelectorAll(':scope > span')).toHaveLength(6);
    expect(screen.queryByText(/별빛|합성|범용 드랍|나올 수 있음/)).toBeNull();
  });

  it('opens a pack in a sheet from its card, lists its gifts, and lets it be given up and restored', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267); // 화왕지절 or 해방된 분노
    renderRoute();
    await user.click(within(rows()).getByRole('button', { name: '화왕지절' }));
    const sheet = screen.getByRole('dialog', { name: '화왕지절' });
    expect(sheet).toHaveAttribute('data-testid', 'block-sheet');
    expect(sheet).toHaveTextContent('Hard 4~5');
    expect(within(sheet).getAllByTestId('pack-gift').length).toBeGreaterThan(1);
    const wantedRow = within(sheet).getAllByTestId('pack-gift').find((el) => el.hasAttribute('data-wanted'))!;
    expect(wantedRow).toHaveTextContent('달궈진 놋쇠');
    expect(wantedRow).toHaveTextContent('전용');
    // The run context is on: each gift is a pressable tile, and floor 4 is not on stage so no entry button.
    expect(within(wantedRow).getByTestId('gift-tile')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sheet).queryByRole('button', { name: '화왕지절 입장' })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: '화왕지절 이 팩 포기' }));
    expect(useApp.getState().options.bannedPacks).toEqual([1402]);
    // The gift now comes from the other pack, and the given-up pack can be restored.
    expect(within(rows()).getByRole('button', { name: '해방된 분노' })).toBeInTheDocument();
    const banned = within(screen.getByTestId('unresolved')).getByTestId('banned-pack');
    expect(banned).toHaveTextContent('화왕지절');
    await user.click(within(banned).getByRole('button', { name: '화왕지절 되돌리기' }));
    expect(useApp.getState().options.bannedPacks).toEqual([]);
  });

  it('opens a sheet from an observed tile and pins the observation from it', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    useApp.getState().toggleWanted(9423); // observable; the planner recommends observing it
    renderRoute();
    const tile = within(within(rows()).getByTestId('start-cell')).getByTestId('observed-tile');
    expect(tile).toHaveTextContent('추천');
    expect(tile).toHaveAttribute('title', '깨진 안경 · 관측 · 변하지 않는 안 가도 됨');
    await user.click(tile);
    const observed = screen.getByTestId('block-sheet');
    expect(observed).toHaveTextContent('변하지 않는 안 가도 됨');
    await user.click(within(observed).getByRole('button', { name: '깨진 안경 관측 지정 전환' }));
    expect(useApp.getState().options.observedGifts).toEqual([9423]);
    await user.click(within(observed).getByRole('button', { name: '닫기' }));
    expect(screen.queryByTestId('block-sheet')).toBeNull();
    expect(within(within(rows()).getByTestId('start-cell')).getByTestId('observed-tile')).toHaveTextContent('지정');
  });

  it('marks a must-have gift with a star badge on its tile', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    useApp.getState().setPriority(9267, 'must');
    renderRoute();
    const icon = within(within(rows()).getByTestId('segment')).getByTestId('gift-icon');
    expect(icon).toHaveAttribute('data-must', 'true');
  });

  it('groups a pack conflict by its floors and lets a pack be included or given up as a whole', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of CLEAR_REWARDS) useApp.getState().toggleWanted(id); // six EXTREME packs for five floors
    renderRoute();
    const group = screen.getByTestId('conflict-group');
    expect(group).toHaveAttribute('data-from', '11');
    expect(group).toHaveTextContent('11~15층 · 자리 5개에 팩 6개');
    const cards = within(group).getAllByTestId('pack-conflict-card');
    expect(cards).toHaveLength(6);
    expect(cards.filter((c) => c.hasAttribute('data-included'))).toHaveLength(5);
    const left = cards.find((c) => !c.hasAttribute('data-included'))!;
    expect(left).toHaveTextContent('핏물진 비린내');
    expect(left).toHaveTextContent('박수 짝짝!');
    expect(screen.getByRole('button', { name: '대안 루트 보기' })).toBeInTheDocument();
    expect(screen.getByTestId('route-summary')).toHaveTextContent('미해결 1');
    // Include the left-out pack: it takes a floor and another pack drops out.
    await user.click(within(left).getByRole('button', { name: '핏물진 비린내 이 팩으로' }));
    expect(useApp.getState().options.preferredPacks).toEqual([1516]);
    const after = within(screen.getByTestId('conflict-group')).getAllByTestId('pack-conflict-card');
    expect(after.find((c) => c.getAttribute('data-pack') === '1516')).toHaveAttribute('data-included');
    expect(after.filter((c) => !c.hasAttribute('data-included'))).toHaveLength(1);
    // Give up an included pack: it leaves the plan and shows in the given-up list until restored.
    const included = after.find((c) => c.hasAttribute('data-included') && c.getAttribute('data-pack') !== '1516')!;
    await user.click(within(included).getByRole('button', { name: /이 팩 포기$/ }));
    expect(useApp.getState().options.bannedPacks).toHaveLength(1);
    const skipped = screen.getByTestId('skipped');
    expect(skipped).toHaveTextContent('포기한 팩 1');
    await user.click(within(skipped).getByRole('button', { name: /되돌리기$/ }));
    expect(useApp.getState().options.bannedPacks).toEqual([]);
  });

  it('offers alternative routes as tabs and confirming one gives that gift up', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of CLEAR_REWARDS) useApp.getState().toggleWanted(id);
    renderRoute();
    const tabs = within(screen.getByRole('tablist', { name: '대안 루트' })).getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('conflict-group')).toBeNull();
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('5/5');
    await user.click(screen.getByRole('button', { name: '이 기프트 포기' }));
    expect(useApp.getState().wanted).toEqual(CLEAR_REWARDS);
    expect(Object.values(useApp.getState().priority)).toEqual(['skip']);
    expect(screen.getByTestId('skipped')).toHaveTextContent('포기한 기프트 1');
  });

  it('lets a must-have gift win the conflict and shows its pack as included', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of CLEAR_REWARDS) useApp.getState().toggleWanted(id);
    useApp.getState().setPriority(9255, 'must');
    renderRoute();
    const cards = within(screen.getByTestId('conflict-group')).getAllByTestId('pack-conflict-card');
    expect(cards.find((c) => c.getAttribute('data-pack') === '1516')).toHaveAttribute('data-included');
    expect(cards.filter((c) => !c.hasAttribute('data-included'))).toHaveLength(1);
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
    useApp.getState().toggleWanted(9208); // 인연 얽힘: full-resonance condition
    renderRoute();
    // The judgement sits on the icon border and its accessible name, in the condition card and
    // on the map tile alike.
    expect(screen.getAllByLabelText(/^판정 불가 · 인연 얽힘/).length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText(/^미충족/)).toHaveLength(0);
    const tile = within(screen.getByTestId('conditions')).getByTestId('gift-icon');
    expect(tile).toHaveAttribute('data-judgement', 'unknown');
  });

  it('colours a gift icon by whether the deck meets its condition', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9088); // 진혼: combustion condition this deck meets
    useApp.getState().toggleWanted(9211); // 먹장구름: sinking condition it does not
    renderRoute();
    const card = screen.getByTestId('conditions');
    const byName = (name: RegExp) => within(card).getByLabelText(name);
    expect(byName(/^충족 · 진혼/)).toHaveAttribute('data-judgement', 'met');
    expect(byName(/^미충족 · 먹장구름/)).toHaveAttribute('data-judgement', 'unmet');
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

  it('copies the plan by segment with localized names instead of raw ids', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    const oneSlot = { ...data, rules: { ...data.rules, giftObservation: { ...data.rules.giftObservation, max: 1 } } };
    const plan = planRoute(
      {
        deck: BURN_DECK,
        wanted: [{ giftId: 9423, required: true }, { giftId: 9415, required: true }, { giftId: 9419, required: true }],
        options: { ...defaultOptions(), lastFloor: 15, hardFromFloor: 1, observedGifts: [9423] },
      },
      oneSlot,
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
    expect(text).toContain('시작: 화상');
    expect(text).toContain('관측: 깨진 안경 (지정)');
    expect(text).toContain('2~3F (어느 층이든): 마주하지 않는 · 낙화');
    expect(text).toContain('  - 불결함 (마주하지 않는)');
    expect(text).toContain('4~15F: 자유');
    for (const word of ['별빛', '조합', '범용']) expect(text).not.toContain(word);
    const without = planToText(plan, (id) => indexes.giftById.get(id)?.name.ko ?? '', () => '', () => '', 'ko', [9283]);
    expect(without.split('\n')[0]).toBe('상납된 시가 제외');
    const marked = planToText(plan, (id) => indexes.giftById.get(id)?.name.ko ?? '', (id) => indexes.packById.get(id)?.name.ko ?? '', () => '', 'ko', [], { must: [9423], skipped: [9283], bannedPacks: [1402] });
    expect(marked).toContain('깨진 안경 (반드시)');
    expect(marked).toContain('포기한 팩: 화왕지절');
    expect(marked.trim().split('\n').at(-1)).toBe('포기: 상납된 시가');
  });

  it('drops the visits made only for the other ingredients once the result alone is the goal', () => {
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9249); // ← 9431 (1016, Hard 1) + 9706·9707 (1102, Hard 2-3)
    // Observation off, or the planner would simply observe the ingredients instead of visiting.
    const noObservation = { ...data, rules: { ...data.rules, giftObservation: { ...data.rules.giftObservation, max: 0 } } };
    renderPlanned(<RoutePlanPanel />, noObservation);
    const packs = () => within(rows()).getAllByTestId('segment-pack').map((el) => el.getAttribute('data-pack'));
    expect(packs()).toEqual(['1016', '1102']);
    act(() => useApp.getState().setGiftStatus(9707, 'failed'));
    // Ingredients stay goals by default, so both packs are still on the map.
    expect(packs()).toEqual(['1016', '1102']);
    expect(screen.getByTestId('unresolved')).toHaveTextContent('수집 실패');
    expect(screen.getByTestId('route-summary')).toHaveTextContent('실패 1');
    act(() => useApp.getState().setFusionGoal(9249, 'resultOnly'));
    expect(within(rows()).queryByTestId('segment-pack')).toBeNull();
    expect(screen.getByTestId('unresolved')).toHaveTextContent('취소했습니다');
  });
});

describe('AppShell', () => {
  const renderShell = () => {
    const { deck, deployed } = useApp.getState();
    return render(<AppShell data={data} indexes={indexes} stats={statsFor(deck, deployed)} lang="ko" dark onShare={() => undefined} onToggleLang={() => undefined} onToggleDark={() => undefined} />);
  };

  it('opens the panels as drawers on a phone, one at a time, and remembers the tab', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(screen.queryByTestId('drawer-left')).toBeNull();
    expect(screen.queryByTestId('panel-left')).toBeNull();
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'undecided');
    const left = screen.getByRole('button', { name: '설정 패널' });
    expect(left).toHaveAttribute('aria-expanded', 'false');
    await user.click(left);
    const drawer = screen.getByRole('dialog', { name: '설정 패널' });
    expect(left).toHaveAttribute('aria-expanded', 'true');
    // The default tab is the items tab; the deck tab shows the twelve slots.
    expect(within(drawer).getByRole('tab', { name: '아이템' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(drawer).getByRole('tab', { name: '덱' }));
    expect(useApp.getState().ui.leftTab).toBe('deck');
    expect(within(drawer).getAllByText('인격 선택')).toHaveLength(12);
    // Opening the other side closes this one.
    await user.click(screen.getByRole('button', { name: '루트 패널' }));
    expect(screen.queryByRole('dialog', { name: '설정 패널' })).toBeNull();
    const right = screen.getByRole('dialog', { name: '루트 패널' });
    expect(within(right).getByTestId('route-empty')).toBeInTheDocument();
    // The empty state sends the player to the items tab of the left drawer.
    await user.click(within(right).getByRole('button', { name: '아이템' }));
    expect(screen.queryByRole('dialog', { name: '루트 패널' })).toBeNull();
    expect(within(screen.getByRole('dialog', { name: '설정 패널' })).getByRole('tab', { name: '아이템' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // The tracker tab lives in the right drawer.
    await user.click(screen.getByRole('button', { name: '루트 패널' }));
    await user.click(screen.getByRole('tab', { name: '추적기' }));
    expect(screen.getByTestId('tracker')).toBeInTheDocument();
    expect(useApp.getState().ui.rightTab).toBe('tracker');
  });

  it('keeps both panels beside the stage on a desktop and folds them from the header', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderShell();
    expect(screen.getByTestId('panel-left')).toBeInTheDocument();
    expect(screen.getByTestId('panel-right')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const left = screen.getByRole('button', { name: '설정 패널' });
    expect(left).toHaveAttribute('aria-expanded', 'true');
    expect(left).toHaveAttribute('aria-controls', 'panel-left');
    await user.click(left);
    expect(screen.queryByTestId('panel-left')).toBeNull();
    expect(useApp.getState().ui.leftOpen).toBe(false);
    await user.click(left);
    expect(screen.getByTestId('panel-left')).toBeInTheDocument();
  });
});

describe('RunStage', () => {
  const renderStage = (withPlan = false) =>
    renderPlanned(
      <>
        <RunStage onOpenGifts={() => undefined} />
        {withPlan ? <RoutePlanPanel /> : null}
      </>,
    );
  const header = () => screen.getByTestId('floor-header');
  const skipFloor = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: '다른 팩 입장' }));
  const lookBack = async (user: ReturnType<typeof userEvent.setup>, floor: number) =>
    user.click(within(header()).getAllByTestId('floor-cell').find((cell) => cell.getAttribute('data-floor') === String(floor))!);
  const pointer = { pointerId: 1, button: 0, clientX: 60, clientY: 200 };
  /** Pull an element vertically by `dy` and let go. */
  const pull = (el: HTMLElement, dy: number) => {
    fireEvent.pointerDown(el, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: pointer.clientY + dy });
    fireEvent.pointerUp(window, { ...pointer, clientY: pointer.clientY + dy });
  };

  it('asks for goals first, then walks to the recommended pack, enters it, marks its gifts and goes back', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    const { unmount } = renderStage();
    expect(screen.getByText('아직 목표 기프트가 없습니다.')).toBeInTheDocument();
    unmount();
    useApp.getState().toggleWanted(9267); // 화왕지절 (1402), Hard 4-5
    renderStage();
    expect(screen.getByTestId('stage-floor')).toHaveTextContent('1');
    expect(screen.queryByTestId('stage-pack')).toBeNull();
    expect(screen.getByText(/이 층에 계획된 팩이 없습니다/)).toBeInTheDocument();
    expect(screen.getByTestId('other-entry-card')).toHaveTextContent('다른 팩 입장');
    for (let i = 0; i < 3; i += 1) await skipFloor(user);
    expect(screen.getByTestId('stage-floor')).toHaveTextContent('4');
    expect(useApp.getState().run).toMatchObject({ currentFloor: 4, stageFloor: 4 });
    // The route's pack for this floor comes first, marked as the suggestion; the other floors read as skipped.
    const card = screen.getByTestId('stage-pack');
    expect(card).toHaveAttribute('data-pack', '1402');
    expect(card).toHaveAttribute('data-recommended');
    expect(card).toHaveTextContent('추천');
    // Portrait, name, then the gifts only this pack drops with the goal ringed; the foot says 입장.
    expect(within(card).getByTestId('pack-image')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '화왕지절 자세히' })).toBeInTheDocument();
    const icons = within(screen.getByTestId('stage-pack-gifts')).getAllByTestId('gift-icon');
    expect(icons.length).toBeGreaterThan(1);
    expect(within(screen.getByTestId('stage-pack-gifts')).getAllByRole('img', { name: /달궈진 놋쇠/ })[0]!.parentElement).toHaveAttribute('data-wanted');
    expect(within(card).getByRole('button', { name: '화왕지절 입장' })).toHaveTextContent('입장');
    expect(screen.getAllByTestId('floor-cell').filter((c) => c.getAttribute('data-state') === 'skipped')).toHaveLength(3);
    await user.click(within(card).getByRole('button', { name: '화왕지절 입장' }));
    expect(useApp.getState().run).toMatchObject({ visits: { 4: 1402 }, currentFloor: 5, stageFloor: 4 });
    // The pack area: the pack on the left, its exclusive drops on the right, goals first and ringed.
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'entered');
    const entered = screen.getByTestId('entered-pack');
    expect(entered).toHaveAttribute('data-pack', '1402');
    expect(entered).toHaveTextContent('4층에 입장');
    expect(within(entered).getByTestId('area-back')).toHaveTextContent('돌아가기');
    expect(within(entered).getByTestId('area-next')).toHaveTextContent('다음 층');
    const tiles = within(screen.getByTestId('exclusive-gifts')).getAllByTestId('gift-tile');
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0]).toHaveAttribute('data-gift', '9267');
    expect(tiles[0]).toHaveAttribute('data-wanted');
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'false');
    expect(tiles[1]).not.toHaveAttribute('data-wanted');
    await user.click(tiles[0]!);
    expect(useApp.getState().run.giftStatus).toMatchObject({ 9267: 'got' });
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'true');
    expect(tiles[0]).toHaveAttribute('data-status', 'got');
    // Looking ahead and back keeps the record; going back clears the entry and what was marked in it.
    await user.click(within(entered).getByTestId('area-next'));
    expect(screen.getByTestId('stage-floor')).toHaveTextContent('5');
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'undecided');
    await lookBack(user, 4);
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'entered');
    expect(useApp.getState().run.giftStatus).toMatchObject({ 9267: 'got' });
    await user.click(screen.getByRole('button', { name: '화왕지절 돌아가기' }));
    expect(useApp.getState().run).toMatchObject({ visits: {}, currentFloor: 4, stageFloor: 4 });
    expect(useApp.getState().run.giftStatus[9267]).toBeUndefined();
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'undecided');
    // The area folds away before it goes, above the card row that is back.
    expect(screen.getByTestId('pack-area-closing')).toBeInTheDocument();
    expect(screen.getByTestId('stage-pack')).toHaveAttribute('data-pack', '1402');
    await waitFor(() => expect(screen.queryByTestId('pack-area-closing')).toBeNull());
  });

  it('enters a pack by pulling its card down past the threshold, but not by a tap, a short pull or a sideways move', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderStage();
    for (let i = 0; i < 3; i += 1) await skipFloor(user);
    const card = screen.getByTestId('stage-pack');
    // A tap: down and up without moving is not a pull.
    fireEvent.pointerDown(card, pointer);
    fireEvent.pointerUp(window, pointer);
    expect(useApp.getState().run.visits).toEqual({});
    // A press on the card's title (a button) that does not move is a click: the sheet opens, nothing enters.
    const title = within(card).getByRole('button', { name: '화왕지절 자세히' });
    fireEvent.pointerDown(title, pointer);
    fireEvent.pointerUp(window, pointer);
    await user.click(title);
    expect(screen.getByTestId('block-sheet')).toBeInTheDocument();
    expect(useApp.getState().run.visits).toEqual({});
    await user.click(screen.getByRole('button', { name: '닫기' }));
    // A sideways move scrolls instead of starting a pull.
    fireEvent.pointerDown(card, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientX: 160, clientY: 210 });
    expect(card).not.toHaveAttribute('data-pulling');
    fireEvent.pointerUp(window, { ...pointer, clientX: 160, clientY: 210 });
    // A short pull moves the card but lets it spring back; past the threshold the foot says so.
    fireEvent.pointerDown(card, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: 205 });
    expect(card).not.toHaveAttribute('data-pulling');
    fireEvent.pointerMove(window, { ...pointer, clientY: 240 });
    expect(card).toHaveAttribute('data-pulling');
    expect(card).not.toHaveAttribute('data-past');
    expect(card.style.transform).toBe('translateY(40px)');
    expect(within(card).getByRole('button', { name: '화왕지절 입장' })).toHaveTextContent('입장');
    fireEvent.pointerUp(window, { ...pointer, clientY: 240 });
    expect(useApp.getState().run.visits).toEqual({});
    expect(card.style.transform).toBe(''); // at rest the card carries no transform (a fixed sheet inside must stay fixed)
    fireEvent.pointerDown(card, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: 290 });
    expect(card).toHaveAttribute('data-past', 'down');
    expect(within(card).getByRole('button', { name: '화왕지절 입장' })).toHaveTextContent('놓으면 입장');
    // Pulling up is not allowed here: it resists and never commits.
    fireEvent.pointerMove(window, { ...pointer, clientY: 100 });
    expect(card).not.toHaveAttribute('data-past');
    expect(card.style.transform).toBe('translateY(-30px)');
    fireEvent.pointerMove(window, { ...pointer, clientY: 290 });
    fireEvent.pointerUp(window, { ...pointer, clientY: 290 });
    expect(useApp.getState().run).toMatchObject({ visits: { 4: 1402 }, currentFloor: 5, stageFloor: 4 });
    // A pull may start on a handle button and end over it (the area moves with the pointer): the
    // click the browser fires afterwards is swallowed, so the floor advances once, not twice.
    const nextHandle = screen.getByTestId('area-next');
    fireEvent.pointerDown(nextHandle, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: 290 });
    fireEvent.pointerUp(window, { ...pointer, clientY: 290 });
    fireEvent.click(nextHandle);
    expect(useApp.getState().run).toMatchObject({ currentFloor: 5, stageFloor: 5 });
  });

  it('passes a floor by pulling the dashed card, and the pack area moves on down and goes back up', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderStage(true);
    expect(within(screen.getByTestId('other-entry-card')).getByRole('button', { name: '다른 팩 입장' })).toHaveTextContent('다음 층');
    pull(screen.getByTestId('other-entry-card'), 90);
    expect(useApp.getState().run).toMatchObject({ currentFloor: 2, stageFloor: 2, visits: {} });
    for (let i = 0; i < 2; i += 1) await skipFloor(user);
    await user.click(screen.getByRole('button', { name: '화왕지절 입장' }));
    expect(screen.getByTestId('route-summary')).not.toHaveTextContent('실패');
    // Pulling the area down leaves the floor: the unmarked goal counts as missed, and the plan reports it.
    const area = screen.getByTestId('entered-pack');
    fireEvent.pointerDown(area, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: 290 });
    expect(area).toHaveAttribute('data-past', 'down');
    expect(within(area).getByTestId('area-next')).toHaveTextContent('놓으면 다음 층');
    fireEvent.pointerUp(window, { ...pointer, clientY: 290 });
    expect(useApp.getState().run).toMatchObject({ currentFloor: 5, stageFloor: 5, giftStatus: { 9267: 'failed' } });
    expect(screen.getByTestId('route-summary')).toHaveTextContent('실패 1');
    expect(screen.getByTestId('unresolved-row')).toHaveTextContent('수집 실패');
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('0/1');
    // Back on the floor, the missed tile reads as such and a press turns it into got.
    await lookBack(user, 4);
    const tile = within(screen.getByTestId('exclusive-gifts')).getAllByTestId('gift-tile')[0]!;
    expect(tile).toHaveAttribute('data-status', 'failed');
    await user.click(tile);
    expect(useApp.getState().run.giftStatus).toMatchObject({ 9267: 'got' });
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('1/1');
    // Pushing the area up goes back: the entry and the marks made in it are gone, the frontier retreats.
    const again = screen.getByTestId('entered-pack');
    fireEvent.pointerDown(again, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientY: 110 });
    expect(again).toHaveAttribute('data-past', 'up');
    expect(within(again).getByTestId('area-back')).toHaveTextContent('놓으면 돌아가기');
    fireEvent.pointerUp(window, { ...pointer, clientY: 110 });
    expect(useApp.getState().run).toMatchObject({ visits: {}, currentFloor: 4, stageFloor: 4 });
    expect(useApp.getState().run.giftStatus[9267]).toBeUndefined();
    // The gift is a plain goal again: the plan covers it through the pack, not through a record.
    expect(screen.getByText(/^확보/).parentElement).toHaveTextContent('1/1');
    expect(screen.getByTestId('route-summary')).not.toHaveTextContent('실패');
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'undecided');
    await waitFor(() => expect(screen.queryByTestId('pack-area-closing')).toBeNull());
  });

  it('collects the observed gift on the first move off floor 1 and shows played floors as history', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    for (const id of [9267, 9423]) useApp.getState().toggleWanted(id); // 깨진 안경 is observable and recommended
    renderStage();
    expect(useApp.getState().run.giftStatus).toEqual({});
    await skipFloor(user);
    expect(useApp.getState().run.giftStatus).toEqual({ 9423: 'got' });
    await lookBack(user, 1);
    // Stepping back onto the skip right before the frontier reopens that floor.
    expect(useApp.getState().run).toMatchObject({ currentFloor: 1, stageFloor: 1 });
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'undecided');
    await skipFloor(user);
    await skipFloor(user);
    await user.click(screen.getByRole('button', { name: '1층' }));
    expect(useApp.getState().run).toMatchObject({ currentFloor: 3, stageFloor: 1 });
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'skipped');
    expect(screen.getByText(/지나간 층 · 다시 입장하면 기록이 바뀝니다/)).toBeInTheDocument();
    expect(screen.queryByTestId('other-entry-card')).toBeNull();
  });

  it('finds any other pack of the floor by name and adds a gift from it as a goal', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderStage();
    for (let i = 0; i < 3; i += 1) await skipFloor(user);
    const others = screen.getByTestId('other-packs');
    await user.type(within(others).getByRole('searchbox', { name: '이 층의 팩 검색' }), '2호선');
    const packs = within(others).getAllByTestId('other-pack');
    expect(packs).toHaveLength(1);
    expect(packs[0]).toHaveAttribute('data-pack', '1109');
    await user.click(within(packs[0]!).getByRole('button', { name: '2호선' }));
    await user.click(screen.getByRole('button', { name: '굴레 목표에 추가' }));
    expect(useApp.getState().wanted).toEqual([9267, 9754]);
    // 2호선 sits on Hard 4-5 too, so it joins the floor's route packs.
    expect(screen.getAllByTestId('stage-pack').map((c) => c.getAttribute('data-pack'))).toContain('1109');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    // It left the "other packs" list for the route row, and enters from there.
    expect(within(others).queryByTestId('other-pack')).toBeNull();
    await user.click(screen.getByRole('button', { name: '2호선 입장' }));
    expect(useApp.getState().run.visits).toEqual({ 4: 1109 });
  });

  it('closes the run after floor 15 and offers a new one', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().toggleWanted(9267);
    renderStage();
    for (let i = 0; i < 15; i += 1) await skipFloor(user);
    expect(useApp.getState().run).toMatchObject({ currentFloor: 16, stageFloor: 15 });
    expect(screen.getByTestId('run-stage')).toHaveAttribute('data-mode', 'done');
    // Nothing in the header moves the run any more: the cards and the pack area do.
    expect(within(header()).queryByRole('button', { name: /다른 팩 입장|다음 층|이전 층/ })).toBeNull();
    expect(screen.queryByTestId('other-entry-card')).toBeNull();
    await user.click(within(screen.getByTestId('stage-done')).getByRole('button', { name: '새 런' }));
    expect(useApp.getState().run).toEqual(emptyRun());
  });
});

describe('Tracker', () => {
  const tile = (id: number) => screen.getAllByTestId('gift-tile').find((el) => el.getAttribute('data-gift') === String(id))!;

  it('lists the twenty-five pack-independent T4 gifts in five groups and marks them by a press', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    renderPlanned(<Tracker />);
    for (const group of ['keyword', 'shard', 'memory', 'attack', 'plain']) expect(screen.getByTestId(`tracker-${group}`)).toBeInTheDocument();
    expect(screen.getAllByTestId('gift-tile')).toHaveLength(25);
    expect(screen.getByTestId('tracker-keyword')).toHaveTextContent('0/7');
    await user.click(screen.getByRole('button', { name: '불꽃의 편린 획득 표시' }));
    expect(useApp.getState().run.giftStatus).toEqual({ 9045: 'got' });
    expect(tile(9045)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tracker-keyword')).toHaveTextContent('1/7');
    expect(screen.queryByTestId('fusion-notice')).toBeNull();
  });

  it('reminds the player to unmark the ingredients 달의 기억 consumed, and lets them do it in place', async () => {
    const user = userEvent.setup();
    useApp.getState().setDeck(BURN_DECK, 7);
    useApp.getState().setGiftStatus(9105, 'got'); // 업화 조각
    useApp.getState().setGiftStatus(9142, 'got'); // 잘려나간 기억
    renderPlanned(<Tracker />);
    await user.click(tile(9083));
    const notice = screen.getByTestId('fusion-notice');
    expect(notice).toHaveTextContent('합성으로 소모한 조각 2개·기억 3개는 미획득으로 표시하세요.');
    expect(within(notice).getAllByRole('listitem')).toHaveLength(3); // the heading and the two held ingredients
    await user.click(within(notice).getByRole('button', { name: '업화 조각 미획득으로' }));
    expect(useApp.getState().run.giftStatus).toEqual({ 9142: 'got', 9083: 'got' });
    expect(within(notice).queryByRole('button', { name: '업화 조각 미획득으로' })).toBeNull();
    // Unmarking 달의 기억 closes the reminder.
    await user.click(tile(9083));
    expect(screen.queryByTestId('fusion-notice')).toBeNull();
    expect(useApp.getState().run.giftStatus).toEqual({ 9142: 'got' });
  });
});
