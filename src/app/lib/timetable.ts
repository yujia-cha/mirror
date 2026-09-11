import type { FloorPlan } from '../../core/types.ts';

export const MAX_FLOOR = 15;

/** Phone layout: every floor row is this tall, so a block's height is its floor span. */
export const ROW_PX = 64;
/** Phone layout: a run of free floors folds into one short row. */
export const FREE_ROW_PX = 40;
/** Desktop layout: every lane row is this tall; a block's width is its floor span. */
export const LANE_PX = 132;

/** With this many blocks side by side on a phone, each lane is too narrow for text. */
export function compactLanes(lanes: number): boolean {
  return lanes >= 4;
}

/**
 * How many pickup icons a block shows before folding the rest into a "+n" chip. Cells are fixed
 * size, so this is a count the span can hold rather than a measurement: two rows of icons per
 * floor column on desktop, a wrap of four per floor row on a phone, one per floor when lanes are
 * compact.
 */
export function iconCap(span: number, layout: 'columns' | 'rows' | 'compact'): number {
  const perFloor = layout === 'columns' ? 2 : layout === 'rows' ? 4 : 1;
  return Math.max(1, span * perFloor);
}

export interface Block {
  floor: FloorPlan;
  from: number;
  to: number;
  lane: number;
}

/** Assign overlapping windows to separate lanes, first-fit, so blocks never cover each other. */
export function laneBlocks(floors: FloorPlan[]): Block[] {
  const blocks: Block[] = [];
  const laneEnds: number[] = [];
  for (const floor of floors) {
    if (floor.packId === null) continue;
    const from = floor.window?.from ?? floor.floor;
    const to = floor.window?.to ?? floor.floor;
    let lane = laneEnds.findIndex((end) => end < from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(to);
    } else laneEnds[lane] = to;
    blocks.push({ floor, from, to, lane });
  }
  return blocks;
}

export interface FreeRun {
  from: number;
  to: number;
}

/**
 * Contiguous floors nothing is planned on: no pack, and outside every block's window. A floor
 * inside a window stays its own cell so the dashed block can span it.
 */
export function freeRuns(floors: FloorPlan[], blocks: Block[]): FreeRun[] {
  const covered = (f: number): boolean => blocks.some((b) => f >= b.from && f <= b.to);
  const runs: FreeRun[] = [];
  for (const plan of floors) {
    if (plan.packId !== null || covered(plan.floor)) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === plan.floor - 1) last.to = plan.floor;
    else runs.push({ from: plan.floor, to: plan.floor });
  }
  return runs;
}

export type TimetableRow = { kind: 'start' } | { kind: 'floor'; floor: number } | { kind: 'free'; from: number; to: number };

/**
 * Rows for the phone layout: the start row, then one row per floor, except that a run of free
 * floors folds into a single short row. `rowOf` maps a floor to its 1-based grid row.
 */
export function timetableRows(floors: FloorPlan[], blocks: Block[]): { rows: TimetableRow[]; rowOf: Map<number, number> } {
  const runs = freeRuns(floors, blocks);
  const rows: TimetableRow[] = [{ kind: 'start' }];
  const rowOf = new Map<number, number>();
  for (const plan of floors) {
    const run = runs.find((r) => plan.floor >= r.from && plan.floor <= r.to);
    if (run) {
      if (run.from === plan.floor) rows.push({ kind: 'free', from: run.from, to: run.to });
    } else rows.push({ kind: 'floor', floor: plan.floor });
    rowOf.set(plan.floor, rows.length);
  }
  return { rows, rowOf };
}
