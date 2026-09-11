import { useEffect, type RefObject } from 'react';

/** Close a popover on Escape or on a pointer press outside `ref`, while `active`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
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
