import { useEffect, useRef, type RefObject } from 'react';

/**
 * Overlays in the order they opened. Only the last one answers Escape and a press outside itself,
 * so a sheet over a drawer takes the Escape alone and a press inside that sheet — which is
 * portaled to `document.body` and therefore "outside" the drawer by containment — leaves the
 * drawer standing.
 */
const stack: object[] = [];

export interface DismissOptions {
  /**
   * The overlay's DOM id, when it has one. A control that carries `aria-controls={id}` already
   * opens and closes this overlay by itself; without this, its `pointerdown` dismissed the overlay
   * and the `click` right after re-opened it, so the button could never close what it had opened.
   */
  id?: string;
}

/** Close a popover on Escape or on a pointer press outside `ref`, while `active`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, active: boolean, options: DismissOptions = {}): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  const token = useRef({});
  const { id } = options;

  useEffect(() => {
    if (!active) return;
    // The token is this overlay's place in the stack. `onDismiss` is read through a ref so an
    // inline callback — which every caller passes — cannot re-run this effect and jump the queue.
    const self = token.current;
    stack.push(self);
    const onTop = (): boolean => stack[stack.length - 1] === self;
    const opener = (target: Element): boolean => {
      if (!id) return false;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
      return target.closest(`[aria-controls="${escaped}"]`) !== null;
    };
    const onPointer = (event: PointerEvent): void => {
      if (!onTop()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (ref.current?.contains(target) || opener(target)) return;
      latest.current();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && onTop()) latest.current();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      const at = stack.lastIndexOf(self);
      if (at >= 0) stack.splice(at, 1);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active, id]);
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
