/**
 * Hold a pressable element for `ms` to trigger a second action without giving up its click: a
 * short press still clicks, a hold fires `onLongPress` once and the click the browser sends on
 * release is consumed by the caller through `consume()`. Built on pointer events so mouse, pen and
 * touch behave the same; moving off the element or cancelling the pointer abandons the hold.
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

export function useLongPress(onLongPress: (() => void) | undefined, ms = 1000): { handlers: LongPressHandlers | Record<string, never>; consume: () => boolean } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;

  const clear = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      // Only the primary button holds; a right press has its own path (the context menu).
      if (event.button !== 0) return;
      clear();
      fired.current = false;
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        latest.current?.();
      }, ms);
    },
    [clear, ms],
  );

  /** True once, right after a hold fired: the click that follows must not act. */
  const consume = useCallback((): boolean => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  if (!onLongPress) return { handlers: {}, consume };
  return { handlers: { onPointerDown, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear }, consume };
}
