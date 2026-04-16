# Plan: Switch to Native Browser (Body) Scroll

**Workflow slug:** native-body-scroll
**Created:** 2026-04-15
**Status:** Ready for tasks

## Architecture Decision

The current layout uses `h-screen flex flex-col` + `<main class="overflow-auto">` to create a locked viewport where only the content area scrolls. Switching to body scroll means:
- Replace `h-screen` with `min-h-screen` (outer div can now grow beyond viewport)
- Remove `overflow-auto` and `min-h-0` from `<main>` (content just flows into the document)
- Keep `flex-1` on `<main>` (still needed so `h-full` children in pages like Runs/Analysis resolve correctly)
- Add `sticky` positioning to header and nav (replaces flexbox pinning)

### Why keep `flex-1` on `<main>`

Several pages use `h-full flex flex-col` at their root div (verified: Runs.tsx line 95, Analysis.tsx, SurveyResults.tsx). These need `<main>` to have a definite computed height. With `min-h-screen flex flex-col` on the outer div and `flex-1` on `<main>`, the flex layout gives `<main>` a computed height of at least `100vh - header (56px) - nav (~44px)`. Child elements with `h-full` resolve against this correctly.

### Why keep the scroll hook (simplified)

`useHorizontalScrollOnWheel` has two distinct functions:
1. **VERTICAL exclusion check** — needed only to stop `<main class="overflow-auto">` from being treated as a horizontal redirect target. Goes away entirely with this change.
2. **Horizontal redirect** — redirects vertical scroll wheel input to `scrollLeft` on `overflow-x-auto` containers. Independently useful for standard mice on tables (CoverageMatrix, domain analysis tables, etc.).

The simplified hook removes the `VERTICAL` array and the entire VERTICAL check branch. The remaining code is about 25 lines instead of 60+.

## Wave Breakdown

### Wave 1: Layout restructure (Layout.tsx + Header.tsx + NavTabs.tsx)

These three files are independent of each other and their changes are small. Implement together.

**Layout.tsx changes:**
- Outer div: `h-screen flex flex-col bg-[#FDFBF7]` → `min-h-screen flex flex-col bg-[#FDFBF7]`
- `<main>` classes: remove `overflow-auto` and `min-h-0`, keep `flex-1` and all padding/width classes unchanged

**Header.tsx changes:**
- `<header className="bg-[#1A1A1A] h-14">` → `<header className="bg-[#1A1A1A] h-14 sticky top-0 z-10">`

**NavTabs.tsx changes:**
- `<nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">` → `<nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800 sticky top-14 z-10">`

### Wave 2: Hook simplification (useHorizontalScrollOnWheel.ts)

Remove the VERTICAL detection entirely. Replace the entire file content with the simplified version below. Also update the JSDoc to remove references to the VERTICAL logic.

Simplified hook (removes `VERTICAL` array and the VERTICAL classList check branch):

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
 *       - If the element actually overflows horizontally → redirect deltaY to scrollLeft.
 *       - Either way, stop — this is the relevant container.
 *   • No match found → do nothing, browser handles normally.
 */
export function useHorizontalScrollOnWheel(): void {
  useEffect(() => {
    const HORIZONTAL = ['overflow-x-auto', 'overflow-x-scroll'] as const;

    const handleWheel = (e: WheelEvent): void => {
      if (e.deltaX !== 0 || e.deltaY === 0) return;

      let el: HTMLElement | null =
        e.target instanceof HTMLElement ? e.target : null;

      while (el !== null && el !== document.documentElement) {
        const cls = el.classList;
        if (HORIZONTAL.some((c) => cls.contains(c))) {
          if (el.scrollWidth > el.clientWidth) {
            // Only redirect if not at the horizontal edge — prevents swallowing
            // scroll events when the table can't scroll further in that direction.
            const atRightEdge = e.deltaY > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth;
            const atLeftEdge = e.deltaY < 0 && el.scrollLeft <= 0;
            if (!atRightEdge && !atLeftEdge) {
              e.preventDefault();
              el.scrollLeft += e.deltaY;
            }
          }
          return;
        }
        el = el.parentElement;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}
```

### Wave 3: Drawer simplification (ModelValueDetailDrawer.tsx)

Remove the `main` scroll lock from the `useEffect`. Specifically:
- Delete line 74: `const main = document.querySelector<HTMLElement>('main');`
- Delete line 76: `const originalMainOverflow = main?.style.overflow ?? '';`
- Delete line 78: `if (main != null) main.style.overflow = 'hidden';`
- Delete lines 83–84: `if (main != null) main.style.overflow = originalMainOverflow;`
- Delete lines 72–73: the comment explaining why dual locking was needed

Keep `document.body.style.overflow = 'hidden'` and its save/restore.

## Risk Callouts

- **`h-full` pages (mitigated):** `flex-1` is preserved on `<main>`. Verified against Runs.tsx, Analysis.tsx, SurveyResults.tsx.
- **Scroll lock CLS on drawer open (residual):** Removing the body scrollbar causes a layout shift. MobileNav already has this same behavior. Acceptable for internal tool; out of scope to fix here.
- **Sticky `top-14` coupling:** If `Header` height changes from `h-14`, the NavTabs sticky offset needs updating. Known coupling between two design constants.
- **Wave ordering:** No dependencies between waves. All three can be done in a single commit.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (brittle offset): deferred — same known coupling as before, already deferred. MEDIUM (flex-1 extra space): rejected — same behavior as original h-screen + flex-1 layout; short pages always had min-viewport-height main. MEDIUM (edge detection sub-pixel): rejected — scrollLeft+clientWidth vs scrollWidth comparison handles sub-pixels correctly; integer operations in all major browsers. LOW (scroll lock race): deferred — pre-existing, out of scope.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MEDIUM (h-full in overflow): rejected — virtualized lists have own internal scroll constraint; h-full in taller main is correct. MEDIUM (class-name only): rejected — pre-existing behavior, unchanged by this PR. MEDIUM (scroll root change): deferred — no other scroll-state code found in codebase.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (no test plan): deferred — no visual test infra exists; tasks.md has manual smoke test covering key scenarios. MEDIUM (drawer z-index): rejected — drawer already z-50, above z-10 sticky. MEDIUM (layout stretching non-h-full): rejected — same behavior as original h-screen+flex-1. LOW (sticky disabled by overflow): rejected — no overflow on any ancestor. LOW (cross-browser): deferred — internal tool, modern browser support.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: MEDIUM (class-name only): rejected — pre-existing behavior, original hook was also class-based by design. MEDIUM (redirect on mixed-axis): deferred — theoretical, no overflow-x-auto elements with vertical overflow coexist in codebase; edge detection mitigates. MEDIUM (main no longer bounded): rejected — this is the intended change (body scroll architecture).
