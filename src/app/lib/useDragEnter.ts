/**
 * Drag a card downward into a drop zone. Built on pointer events without a library: listeners go
 * on `window` so the gesture survives leaving the card, pointer capture is used only where the
 * browser offers it, and the drop is decided by the zone's bounding box rather than
 * `elementFromPoint` (which jsdom lacks). Only a mostly-vertical move past `threshold` starts a
 * drag, so a tap stays a click and a sideways swipe stays a scroll of the card row.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface DragState<Id> {
  id: Id;
  /** Where the card was when the pointer went down, for drawing the ghost. */
  startRect: DOMRect;
  dx: number;
  dy: number;
}

export interface DragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function useDragEnter<Id>({
  onDrop,
  zoneRef,
  threshold = 8,
}: {
  onDrop: (id: Id) => void;
  zoneRef: RefObject<HTMLElement | null>;
  threshold?: number;
}): { drag: DragState<Id> | null; over: boolean; handlers: (id: Id) => DragHandlers } {
  const [drag, setDrag] = useState<DragState<Id> | null>(null);
  const [over, setOver] = useState(false);
  const pending = useRef<{ id: Id; pointerId: number; x: number; y: number; rect: DOMRect; element: HTMLElement; dragging: boolean } | null>(null);
  const overRef = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const finish = useCallback((): void => {
    const state = pending.current;
    pending.current = null;
    overRef.current = false;
    setDrag(null);
    setOver(false);
    if (state && typeof state.element.releasePointerCapture === 'function') {
      try {
        state.element.releasePointerCapture(state.pointerId);
      } catch {
        // Capture may already be gone; nothing to release.
      }
    }
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const state = pending.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.dragging) {
        if (Math.abs(dy) <= threshold || Math.abs(dy) < Math.abs(dx)) return;
        state.dragging = true;
      }
      const zone = zoneRef.current?.getBoundingClientRect();
      const inside = zone !== undefined && event.clientX >= zone.left && event.clientX <= zone.right && event.clientY >= zone.top && event.clientY <= zone.bottom;
      overRef.current = inside;
      setOver(inside);
      setDrag({ id: state.id, startRect: state.rect, dx, dy });
    };
    const onUp = (event: PointerEvent): void => {
      const state = pending.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dropped = state.dragging && overRef.current;
      const id = state.id;
      finish();
      if (dropped) dropRef.current(id);
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
  }, [finish, threshold, zoneRef]);

  const handlers = useCallback(
    (id: Id): DragHandlers => ({
      onPointerDown: (event) => {
        if (event.button !== 0 || pending.current) return;
        // A press on a control inside the card is a click, not a drag: capturing the pointer here
        // would retarget the click away from the button.
        if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, summary')) return;
        const element = event.currentTarget;
        pending.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: element.getBoundingClientRect(), element, dragging: false };
        if (typeof element.setPointerCapture === 'function') {
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            // Some engines refuse capture for synthetic pointers; the window listeners still work.
          }
        }
      },
    }),
    [],
  );

  return { drag, over, handlers };
}
