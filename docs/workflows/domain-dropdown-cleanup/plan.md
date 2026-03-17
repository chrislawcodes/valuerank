# Domain Dropdown Cleanup Plan

## Scope

Implement the Domains-menu cleanup in the web nav components and update the nav tests to match the new information architecture.

The implementation should stay strictly inside the navigation components and their targeted tests.

## Design Summary

Desktop `NavTabs` currently renders a flat Domains dropdown. This feature will add a small menu-item type split so the Domains menu can contain both direct links and one grouped submenu item.

Mobile `MobileNav` currently models nested items as a flat list with indentation. This feature will move it to a lightweight tree structure so `Domain Setup` can be represented as a grouped section while preserving the current highlighting behavior for top-level parents like `Validation` and `Archive`.

## Implementation Steps

1. Replace the flat desktop Domains menu data with a mixed structure that supports direct links plus a grouped `Domain Setup` item.
2. Render `Trials` as a first-level Domains destination and remove `New Vignette`.
3. Make `Domain Setup` the final Domains-menu item and render its nested links beneath a submenu toggle.
4. Keep active-state detection working for both direct links and grouped setup links.
5. Reshape mobile nav items into a tree so `Domains` can contain `Trials` plus the `Domain Setup` grouping.
6. Preserve the existing mobile rule where parent items with nested compatibility routes do not automatically highlight when only a child route is active.
7. Update desktop nav tests to open the actual dropdowns and assert the new Domains menu structure.
8. Update mobile nav tests to assert `Trials`, the `Domain Setup` grouping, and active highlighting for a setup route.

## Constraints

- no route changes
- no new API or GraphQL work
- no behavior changes for Validation or Archive navigation
- keep the UI adjustment small and local to the existing nav components

## Verification Suite

```bash
cd /private/tmp/valuerank-domain-dropdown-cleanup-11093/cloud
npm run test --workspace=@valuerank/web -- tests/components/layout/NavTabs.test.tsx tests/components/layout/MobileNav.test.tsx
npm run build --workspace=@valuerank/web
```

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: The spec now names all four setup routes, makes active-state and mobile grouping acceptance criteria explicit, and intentionally keeps a11y/manual smoke checking as a residual follow-up rather than widening this slice.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: The spec now names all four setup routes, makes active-state and mobile grouping acceptance criteria explicit, and intentionally keeps a11y/manual smoke checking as a residual follow-up rather than widening this slice.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: The plan keeps the implementation tightly scoped to nav components and tests, and the remaining visual or accessibility concerns are documented as residual risks rather than blockers for this targeted cleanup.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: The plan keeps the implementation tightly scoped to nav components and tests, and the remaining visual or accessibility concerns are documented as residual risks rather than blockers for this targeted cleanup.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: No mobile parent-highlighting regression was introduced here; the child-only highlighting pattern for nested mobile sections already existed. Removing New Vignette and adding a Domain Setup submenu are intentional product decisions, and targeted tests cover the active-state paths changed in this slice.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: No mobile parent-highlighting regression was introduced here; the child-only highlighting pattern for nested mobile sections already existed. Removing New Vignette and adding a Domain Setup submenu are intentional product decisions, and targeted tests cover the active-state paths changed in this slice.
