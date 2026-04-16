import { useEffect } from 'react';

/**
 * Attaches a global wheel listener that redirects vertical scroll to horizontal
 * when the scroll target is inside a Tailwind `overflow-x-auto` / `overflow-x-scroll`
 * container.
 *
 * Why class-based (not computed style):
 *   - The CSS spec forces overflow-y to `auto` whenever overflow-x is set to `auto`,
 *     so getComputedStyle can't distinguish "horizontal-only" from "both-axis" containers.
 *   - The <main> layout container uses class `overflow-auto` (both axes); it must never
 *     be treated as a horizontal-redirect target even when wide content makes its
 *     scrollWidth > clientWidth.
 *   - Tailwind class names are the reliable signal for intent.
 *
 * Behaviour:
 *   Walk up from the event target.
 *   • First hit with `overflow-x-auto` / `overflow-x-scroll` class:
 *       - If the element actually overflows horizontally → redirect deltaY to scrollLeft.
 *       - Either way, stop — this is the relevant container.
 *   • First hit with `overflow-auto` / `overflow-scroll` / `overflow-y-auto` / `overflow-y-scroll`:
 *       - Stop and do nothing — let the browser scroll it vertically.
 *   • No match found → do nothing, browser handles normally.
 */
export function useHorizontalScrollOnWheel(): void {
  useEffect(() => {
    const HORIZONTAL = ['overflow-x-auto', 'overflow-x-scroll'] as const;
    const VERTICAL = ['overflow-auto', 'overflow-scroll', 'overflow-y-auto', 'overflow-y-scroll'] as const;

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
            e.preventDefault();
            el.scrollLeft += e.deltaY;
          }
          return; // Stop regardless — this is the container in scope
        }

        // Explicit vertical (or both-axis) scroll container — don't intercept
        if (VERTICAL.some((c) => cls.contains(c))) {
          return;
        }

        el = el.parentElement;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}
