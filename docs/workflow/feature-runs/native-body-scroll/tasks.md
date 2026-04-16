# Tasks: Switch to Native Browser (Body) Scroll

All changes are small (~30 lines total diff). No dependencies between files. All fit in a single [CHECKPOINT].

[CHECKPOINT]

## Task 1: Layout.tsx — restructure outer div and main

**File:** `cloud/apps/web/src/components/layout/Layout.tsx`

Change:
```
<div className="h-screen flex flex-col bg-[#FDFBF7]">
```
To:
```
<div className="min-h-screen flex flex-col bg-[#FDFBF7]">
```

Change `<main>` className:
- Remove: `flex-1 min-h-0 overflow-auto`
- Keep: `flex-1` and all padding/width/centering classes
- Before: `flex-1 min-h-0 overflow-auto ${fullWidth ? 'px-4 py-8' : 'max-w-7xl mx-auto px-4 py-8 w-full'}`
- After: `flex-1 ${fullWidth ? 'px-4 py-8' : 'max-w-7xl mx-auto px-4 py-8 w-full'}`

**Estimated diff:** ~3 lines changed

---

## Task 2: Header.tsx — add sticky positioning

**File:** `cloud/apps/web/src/components/layout/Header.tsx`

Change:
```
<header className="bg-[#1A1A1A] h-14">
```
To:
```
<header className="bg-[#1A1A1A] h-14 sticky top-0 z-10">
```

**Estimated diff:** 1 line changed

---

## Task 3: NavTabs.tsx — add sticky positioning

**File:** `cloud/apps/web/src/components/layout/NavTabs.tsx`

Change:
```
<nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">
```
To:
```
<nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800 sticky top-14 z-10">
```

**Estimated diff:** 1 line changed

---

## Task 4: useHorizontalScrollOnWheel.ts — remove VERTICAL detection

**File:** `cloud/apps/web/src/hooks/useHorizontalScrollOnWheel.ts`

Replace the entire file with the simplified version (removes VERTICAL array, removes VERTICAL classList check branch, updates JSDoc):

```typescript
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
```

**Estimated diff:** ~15 lines removed (VERTICAL array + check branch + JSDoc VERTICAL section), ~10 lines added (edge detection logic)

---

## Task 5: ModelValueDetailDrawer.tsx — remove main scroll lock

**File:** `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx`

In the `useEffect` at the top of the component body, remove:
1. Lines 72–73: the comment block starting with `// Lock both body and the layout's <main> scroll container.`
2. Line 74: `const main = document.querySelector<HTMLElement>('main');`
3. Line 76: `const originalMainOverflow = main?.style.overflow ?? '';`
4. Line 78: `if (main != null) main.style.overflow = 'hidden';`
5. Lines 83–84: `if (main != null) main.style.overflow = originalMainOverflow;`

Keep:
- `const originalBodyOverflow = document.body.style.overflow;`
- `document.body.style.overflow = 'hidden';`
- `document.body.style.overflow = originalBodyOverflow;`
- The `keydown` escape handler (unchanged)

**Estimated diff:** ~7 lines removed

---

## Verification Steps

After implementing all tasks:

1. **Build check:** Run `npm run build --workspace @valuerank/web` from `cloud/`. Must pass cleanly.
2. **Lint check:** Run `npm run lint --workspace @valuerank/web` from `cloud/`. Must pass cleanly.
3. **VERTICAL removal check:** Grep for `overflow-y-auto` and `overflow-scroll` in page components. Verify no `overflow-y-auto` element is an ancestor of an `overflow-x-auto` table in the same DOM tree (i.e., the VERTICAL check removal is safe).
4. **Manual smoke test:** Load a page with a horizontal table (e.g. `/domains/coverage`, `/models`). Confirm:
   - Page scrolls with body scrollbar (not inside main)
   - Header and nav are sticky (stay at top when scrolling)
   - Wheel scroll inside table area redirects to horizontal
   - Wheel scroll in left/right margin scrolls the page
5. **Drawer test:** Open the model value detail drawer on `/models`. Confirm background scroll is locked. Close drawer. Confirm scroll restores.
