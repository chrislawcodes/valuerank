# Spec: Switch to Native Browser (Body) Scroll

**Workflow slug:** native-body-scroll
**Created:** 2026-04-15
**Status:** Ready for plan

## Background

The current layout uses `h-screen flex flex-col` on the outer wrapper and `overflow-auto` on `<main>` to create a "fixed chrome, scrolling content area" pattern. This was done to pin the header and nav bar while only scrolling the main content.

That architecture created two compounding problems:
1. **Scroll wheel breakage** — when the cursor was in the left margin (outside the `<main>` scroll container), wheel events hit the wrong element and were silently swallowed. A global `WheelEvent` listener was added to patch this. The listener needed a VERTICAL class exclusion list to avoid intercepting `<main class="overflow-auto">` as a horizontal redirect target.
2. **Extra complexity** — the layout required `min-h-0` on `<main>` to allow flex shrinking below intrinsic height, and `flex-1` to fill the screen. These constraints make the layout harder to reason about.

Switching to native browser scroll simplifies the layout. The VERTICAL exclusion list in the wheel hook is no longer needed, so the hook becomes much simpler. The `<main>` scroll container is gone.

## Goal

Replace the custom scroll container architecture with native browser (body) scroll. Visually, nothing changes — the header and nav become `position: sticky` instead of pinned via flexbox. Functionally, scroll works everywhere without complex event interception.

This is a technical simplification only. No visual redesign.

## Scope

### In scope

- Outer wrapper div in `Layout.tsx`: `h-screen` → `min-h-screen` (keep `flex flex-col bg-[#FDFBF7]`)
- `<main>` in `Layout.tsx`: remove `overflow-auto` and `min-h-0`; keep `flex-1` so `h-full` children still resolve against a definite height
- Add `sticky top-0 z-10` to `<header>` element in `Header.tsx`
- Add `sticky top-14 z-10` to `<nav>` element in `NavTabs.tsx`
- Simplify `useHorizontalScrollOnWheel.ts`: remove the `VERTICAL` array and its check entirely (the `<main class="overflow-auto">` false-positive that required it goes away with this change). Also add edge detection: only prevent default and redirect scroll when the container is **not** already at its horizontal edge. This prevents the hook from swallowing scroll events when the table is scrolled all the way to one side.
- Simplify `ModelValueDetailDrawer.tsx` scroll lock to body-only: remove the `main` element lock (lines 74, 78–79, 83–84) and the comment explaining why both locks were needed

### Out of scope

- Deleting `useHorizontalScrollOnWheel.ts` entirely — the hook still provides vertical→horizontal scroll redirect for standard mice on `overflow-x-auto` tables, which is independently useful
- Visual redesign of header or nav
- Any changes to `CopyVisualButton.tsx` (screenshot logic already handles overflow containers correctly)
- Any changes to page content or page-level padding/margins
- Fixing concurrent scroll lock management across MobileNav / Modal / Drawer (pre-existing, not introduced by this change)

## Files Changed

| File | Change |
|------|--------|
| `cloud/apps/web/src/components/layout/Layout.tsx` | `h-screen` → `min-h-screen` on outer div; remove `overflow-auto` and `min-h-0` from `<main>`; keep `flex-1` |
| `cloud/apps/web/src/components/layout/Header.tsx` | Add `sticky top-0 z-10` to `<header>` element |
| `cloud/apps/web/src/components/layout/NavTabs.tsx` | Add `sticky top-14 z-10` to `<nav>` element |
| `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` | Remove `main` scroll lock; keep `document.body.style.overflow = 'hidden'` only; remove the comment explaining dual locking |
| `cloud/apps/web/src/hooks/useHorizontalScrollOnWheel.ts` | Remove `VERTICAL` array, remove VERTICAL `classList` check, and simplify the `while` loop — keep HORIZONTAL redirect logic |

## Acceptance Criteria

1. All pages scroll via the native browser (body) scroll — the browser scrollbar appears on the viewport/body, not inside `<main>`.
2. Scroll wheel works from anywhere on the page, including left/right margins outside the content area.
3. `useHorizontalScrollOnWheel.ts` still exists but has no `VERTICAL` array and no VERTICAL class check.
4. Vertical wheel scroll over `overflow-x-auto` tables still redirects to horizontal scroll (standard mouse support preserved).
5. The header and nav tab bar remain visible at the top when scrolling down a long page (sticky works).
6. Pages that use `h-full flex flex-col` internally (e.g. Runs, Analysis, SurveyResults) continue to work — `<main>` still provides a definite height via its `flex-1` role inside a `min-h-screen flex flex-col` parent.
7. `ModelValueDetailDrawer` still prevents background scroll when open.
8. `npm run lint` and `npm run build` for `@valuerank/web` pass cleanly.

## Edge Cases

- **`h-full` child pages:** `<main>` keeps `flex-1` inside a `min-h-screen flex flex-col` parent. This gives `<main>` a definite computed height of at least `100vh - header - nav`, so `h-full` inside `<main>` resolves correctly. Verified: `Runs.tsx` line 95, `Analysis.tsx`, `SurveyResults.tsx` all use `h-full flex flex-col` at root.
- **Drawer open on a long page:** Body scroll lock is sufficient — `<main>` no longer participates in scrolling, so locking body is the only thing needed.
- **MobileNav:** Renders its slide-out panel with `fixed` positioning (`fixed top-0 left-0 bottom-0 w-64 z-50`). `fixed` elements are always positioned relative to the viewport, not their nearest sticky ancestor. No interaction with the sticky header.
- **NavTabs dropdown menus:** Use `z-50` for popover panels. Sticky nav is `z-10`. Dropdowns appear above it without conflict.
- **Background color on short pages:** `min-h-screen` on the outer div ensures `bg-[#FDFBF7]` always fills at least the full viewport height. No bare browser default background below the wrapper.
- **Horizontal-scroll tables:** `CoverageMatrix.tsx`, `ModelValueDetailDrawer.tsx` inner table, and others with `overflow-x-auto` still receive wheel→horizontal redirect via the simplified hook.

## Non-Goals

- Merging the two dark bars (Header + NavTabs) into one — not requested.
- Changing the padding, spacing, or max-width of page content.
- Fixing z-index management globally — values are pre-existing and functional.
