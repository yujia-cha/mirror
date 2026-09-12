/**
 * Pull a card or panel vertically to commit an action: down to enter a pack or move on, up to go
 * back. Built on pointer events without a library: listeners go on `window` so the gesture
 * survives leaving the element, and only a mostly-vertical move past `start` begins a pull, so a
 * tap stays a click and a sideways swipe still scrolls the card row. A press that starts on a
 * control inside the element (a button, a link, an input) is never a pull: the click must reach
 * it. Releasing past `threshold` commits; short of it the element springs back (the CSS
 * transition is the caller's, applied while `pulling` is false). A direction the caller does not
 * allow moves with resistance and never commits.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

export type PullDirection = 'down' | 'up';

export interface PullState {
  /** Current vertical offset in px (positive = down); 0 when idle. */
  offset: number;
  /** A pull is in progress (no transition while true). */
  pulling: boolean;
  /** The direction the pull has passed the threshold in, if any. */
  past: PullDirection | null;
}

export interface PullHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

const CONTROLS = 'button, a, input, select, textarea, summary, [role="button"]';

export function usePullGesture({
  onCommit,
  directions,
  threshold = 72,
  start = 8,
  resistance = 0.3,
}: {
  onCommit: (direction: PullDirection) => void;
  directions: readonly PullDirection[];
  threshold?: number;
  start?: number;
  resistance?: number;
}): PullState & { handlers: PullHandlers } {
  const [state, setState] = useState<PullState>({ offset: 0, pulling: false, past: null });
  const pending = useRef<{ pointerId: number; x: number; y: number; element: HTMLElement; dragging: boolean; past: PullDirection | null } | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const directionsRef = useRef(directions);
  directionsRef.current = directions;

  const finish = useCallback((): void => {
    const current = pending.current;
    pending.current = null;
    setState({ offset: 0, pulling: false, past: null });
    if (current && typeof current.element.releasePointerCapture === 'function') {
      try {
        current.element.releasePointerCapture(current.pointerId);
      } catch {
        // Capture may already be gone; nothing to release.
      }
    }
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const current = pending.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.dragging) {
        if (Math.abs(dy) <= start || Math.abs(dy) < Math.abs(dx)) return;
        current.dragging = true;
      }
      const direction: PullDirection = dy > 0 ? 'down' : 'up';
      const allowed = directionsRef.current.includes(direction);
      const offset = allowed ? dy : dy * resistance;
      const past = allowed && Math.abs(dy) >= threshold ? direction : null;
      current.past = past;
      setState({ offset, pulling: true, past });
    };
    const onUp = (event: PointerEvent): void => {
      const current = pending.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const past = current.dragging ? current.past : null;
      finish();
      if (past) commitRef.current(past);
    };
    const onCancel = (event: PointerEvent): void => {
      if (pending.current && event.pointerId === pending.current.pointerId) finish();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [finish, resistance, start, threshold]);

  const handlers: PullHandlers = {
    onPointerDown: (event) => {
      if (event.button !== 0 || pending.current) return;
      if (event.target instanceof Element && event.target.closest(CONTROLS)) return;
      const element = event.currentTarget;
      pending.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, element, dragging: false, past: null };
      if (typeof element.setPointerCapture === 'function') {
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // Some engines refuse capture for synthetic pointers; the window listeners still work.
        }
      }
    },
  };

  return { ...state, handlers };
}

/** The transform a pulled element carries, springing back when the pointer lets go short of the threshold. */
export function pullStyle(state: PullState): CSSProperties {
  return {
    touchAction: 'pan-x',
    transform: `translateY(${state.offset}px)`,
    transition: state.pulling ? 'none' : 'transform 180ms ease-out',
  };
}
