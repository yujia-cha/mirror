import { useEffect, type RefObject } from 'react';

/**
 * Layers that currently listen for a dismissing press or Escape, oldest first.
 *
 * Every listener here is on `document`, and a sheet portals to `document.body` — so without a
 * stack a press inside the sheet reads as "outside" to every layer under it, and one tap closes
 * the whole pile (the phone bug where closing a gift sheet also closed the panel). Only the top
 * layer reacts; the ones below it wait their turn.
 */
const layers: symbol[] = [];

/** Close a popover on Escape or on a pointer press outside `ref`, while `active` and topmost. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const token = Symbol('dismiss-layer');
    layers.push(token);
    const topmost = (): boolean => layers[layers.length - 1] === token;
    const onPointer = (event: PointerEvent): void => {
      if (!topmost()) return;
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!topmost()) return;
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      const at = layers.lastIndexOf(token);
      if (at !== -1) layers.splice(at, 1);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}

/** Arrow-key stepping over a list of `count` items; returns the next active index or null to keep. */
export function stepIndex(key: string, active: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return (active + 1) % count;
  if (key === 'ArrowUp') return (active - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
