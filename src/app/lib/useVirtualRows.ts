import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';

/**
 * Windowing for a long list of rows with known heights: only rows inside the scroll viewport
 * (plus `overscan`) render, the rest is two spacers. No dependency; heights are prefix-summed
 * so an expanded row may be taller than its neighbours.
 */
export function useVirtualRows(
  heights: number[],
  containerRef: RefObject<HTMLElement | null>,
  overscan = 6,
): { start: number; end: number; padTop: number; padBottom: number; total: number } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  const offsets = useMemo(() => {
    const out = new Array<number>(heights.length + 1);
    out[0] = 0;
    for (let i = 0; i < heights.length; i += 1) out[i + 1] = out[i]! + heights[i]!;
    return out;
  }, [heights]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (): void => setViewport(el.clientHeight || 600);
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [containerRef, onScroll]);

  const total = offsets[heights.length] ?? 0;
  let start = 0;
  while (start < heights.length && offsets[start + 1]! < scrollTop) start += 1;
  let end = start;
  while (end < heights.length && offsets[end]! < scrollTop + viewport) end += 1;
  start = Math.max(0, start - overscan);
  end = Math.min(heights.length, end + overscan);
  return { start, end, padTop: offsets[start] ?? 0, padBottom: total - (offsets[end] ?? total), total };
}
