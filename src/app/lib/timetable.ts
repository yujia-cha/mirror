import type { FloorPlan } from '../../core/types.ts';

export const MAX_FLOOR = 15;

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
