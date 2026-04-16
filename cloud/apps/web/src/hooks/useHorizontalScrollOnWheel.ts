import { useEffect } from 'react';

/**
 * Attaches a global wheel listener that redirects vertical scroll to horizontal
 * when the scroll target is inside a Tailwind `overflow-x-auto` / `overflow-x-scroll`
 * container.
 *
 * Behaviour:
 *   Walk up from the event target.
 *   • First hit with `overflow-x-auto` / `overflow-x-scroll` class:
 *       - If the element overflows horizontally AND is not at its scroll edge in the
 *         direction of the delta → redirect deltaY to scrollLeft.
 *       - If the element is at its edge (can't scroll further), let the event fall
 *         through to the browser so the page can scroll vertically instead.
 *       - Either way, stop — this is the relevant container.
 *   • No match found → do nothing, browser handles normally.
 */
export function useHorizontalScrollOnWheel(): void {
  useEffect(() => {
    const HORIZONTAL = ['overflow-x-auto', 'overflow-x-scroll'] as const;

    const handleWheel = (e: WheelEvent): void => {
      // Only intercept pure vertical scroll input (scroll wheel or vertical trackpad swipe)
      if (e.deltaX !== 0 || e.deltaY === 0) return;

      let el: HTMLElement | null =
        e.target instanceof HTMLElement ? e.target : null;

      while (el !== null && el !== document.documentElement) {
        const cls = el.classList;

        // Explicit horizontal-scroll container
        if (HORIZONTAL.some((c) => cls.contains(c))) {
          if (el.scrollWidth > el.clientWidth) {
            // Only redirect — and only prevent default — if the container can still
            // scroll in the requested direction. At an edge, let the browser handle
            // the event so the page can continue to scroll vertically.
            const atRightEdge = e.deltaY > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth;
            const atLeftEdge = e.deltaY < 0 && el.scrollLeft <= 0;
            if (!atRightEdge && !atLeftEdge) {
              e.preventDefault();
              el.scrollLeft += e.deltaY;
            }
          }
          return; // Stop regardless — this is the container in scope
        }

        el = el.parentElement;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}
