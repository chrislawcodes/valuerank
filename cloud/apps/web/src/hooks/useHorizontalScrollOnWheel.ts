import { useEffect } from 'react';

/**
 * Attaches a global wheel listener that redirects vertical scroll to horizontal
 * when the nearest scrollable ancestor is a horizontal-only overflow container.
 *
 * This fixes the UX issue where hovering over the left-side labels of a wide
 * table and scrolling moves the page instead of the table.
 *
 * Logic:
 * - Walk up from the event target to find the first element that can actually scroll.
 * - If that element can only scroll horizontally (not vertically), redirect deltaY
 *   to scrollLeft so the table moves instead of the page.
 * - If the first scrollable ancestor is vertical (or both), let the browser handle
 *   the event normally — we never interfere with intentional page/modal scroll.
 */
export function useHorizontalScrollOnWheel(): void {
  useEffect(() => {
    const handleWheel = (e: WheelEvent): void => {
      // Only intercept pure vertical scroll input
      if (e.deltaX !== 0 || e.deltaY === 0) return;

      let el: HTMLElement | null =
        e.target instanceof HTMLElement ? e.target : null;

      while (el !== null && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const ox = style.overflowX;
        const oy = style.overflowY;
        const canScrollX =
          (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth;
        const canScrollY =
          (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight;

        if (canScrollX || canScrollY) {
          if (canScrollX && !canScrollY) {
            // Horizontal-only container: redirect wheel to horizontal scroll
            e.preventDefault();
            el.scrollLeft += e.deltaY;
          }
          // If vertical (or both), fall through — browser handles normally
          return;
        }

        el = el.parentElement;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}
