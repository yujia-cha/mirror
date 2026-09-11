import { describe, expect, it } from 'vitest';
import type { FloorPlan } from '../../core/types.ts';
import { compactLanes, freeRuns, iconCap, laneBlocks, timetableRows } from '../lib/timetable.ts';

const floor = (n: number, packId: number | null, window: FloorPlan['window'] = null): FloorPlan => ({
  floor: n,
  mode: n > 10 ? 'extreme' : n > 5 ? 'parallel' : 'hard',
  packId,
  reason: packId === null ? 'free' : 'required',
  pickups: [],
  observation: { needed: false, possible: true, starlight: 0 },
  alternatives: [],
  window,
});

describe('timetable layout', () => {
  const floors = [floor(1, null), floor(2, null), floor(3, 1014, { from: 3, to: 4 }), floor(4, null), ...[5, 6, 7].map((n) => floor(n, null))];
  const blocks = laneBlocks(floors);

  it('folds free floors into runs but keeps floors inside a window separate', () => {
    expect(freeRuns(floors, blocks)).toEqual([
      { from: 1, to: 2 },
      { from: 5, to: 7 },
    ]);
  });

  it('gives the phone layout one row per run and maps floors to rows', () => {
    const { rows, rowOf } = timetableRows(floors, blocks);
    expect(rows).toEqual([{ kind: 'start' }, { kind: 'free', from: 1, to: 2 }, { kind: 'floor', floor: 3 }, { kind: 'floor', floor: 4 }, { kind: 'free', from: 5, to: 7 }]);
    expect(rowOf.get(3)).toBe(3);
    expect(rowOf.get(4)).toBe(4);
    expect(rowOf.get(7)).toBe(5);
  });

  it('goes compact from four lanes and caps icons by the floor span', () => {
    expect(compactLanes(3)).toBe(false);
    expect(compactLanes(4)).toBe(true);
    expect(iconCap(1, 'columns')).toBe(2);
    expect(iconCap(2, 'columns')).toBe(4);
    expect(iconCap(1, 'rows')).toBe(4);
    expect(iconCap(5, 'compact')).toBe(5);
  });
});
