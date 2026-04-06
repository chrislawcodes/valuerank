# Domain Coverage Hub — Plan Notes

## Goal
Replace the Overview tab content in Domains.tsx with the coverage matrix from DomainCoverage.tsx,
so users land on actionable gap data instead of vague readiness signals. Add a "+" action on
uncovered cells to navigate to create a vignette for that value pair.

---

## What Changes

### 1. Overview tab content (Domains.tsx)
- Remove the current "Readiness snapshot" + "Recommended next steps" panel (lines ~508–589).
- Render the coverage matrix inline instead, scoped to the currently-selected domain.
- The domain is already known from `selectedDomain.id` — no separate domain-picker needed.
- Keep the signature picker and model filter pills (they filter the matrix and are useful context).
- The "Recommended next steps" action buttons (Create Vignette, Fix Setup, Start pilot, etc.)
  can move into the matrix header or be collapsed into a compact action bar at the top of the tab.

### 2. "+" action on uncovered cells (CoverageCell / CoveragePopover)
- When `!hasVignette && !isDiagonal`, the popover currently just says "No batch for this value pair."
- Add a "Create Vignette for this pair" link that navigates to `/job-choice/new?domainId=X&valueA=Y&valueB=Z`.
- JobChoiceNew.tsx would need to accept `valueA` and `valueB` query params and pre-populate
  the value statement selectors — OR we can just pre-populate domainId and leave value selection
  to the user. Simpler: just navigate to `/job-choice/new?domainId=X` for now (consistent with
  the existing handleCreateVignettePair path), but put valueA/valueB in the URL for future use.

### 3. Standalone /domains/coverage route
Options:
  A. Keep it — it has domain-picker, signature, model filters, and the copy button. Useful for
     cross-domain comparison and full-screen sharing. Just update NavTabs to keep the link.
  B. Remove it — redirect to /domains?tab=overview with the domainId pre-set.
  C. Keep it but deprioritize in nav (move from top-level domain nav to a link inside Domains).

Recommendation: Keep the standalone route. It serves a different use case (compare coverage
across domains, copy-to-clipboard for docs). Remove it from the top-level NavTabs "Domain" menu
and replace with a "View full coverage" link inside the Overview tab instead. This reduces nav
clutter without deleting functionality.

### 4. Extracting shared logic
DomainCoverage.tsx today manages its own:
- domain state (selectedDomainId, domain picker)
- signature state (selectedSignature, allowAllSignatures, useLegacyQuery)
- model filter state (selectedModelIds, availableModelIds)
- URL sync for all of the above

For embedding in Domains.tsx, we want the matrix controlled by the already-selected domain.
Two approaches:
  A. Extract a `<CoverageMatrix domainId={...} />` component that takes domainId as a prop
     and manages its own signature/model state internally. No URL sync needed (Domains.tsx
     already syncs domainId).
  B. Lift all state into Domains.tsx and wire it together.

Recommendation: Extract a `CoverageMatrix` component (approach A). It keeps Domains.tsx from
growing further and DomainCoverage.tsx can also use it. DomainCoverage.tsx becomes a thin
shell: domain picker + URL sync + `<CoverageMatrix>`.

### 5. File size constraint
cloud/CLAUDE.md caps React components at 400 lines. DomainCoverage.tsx is already 711 lines.
Domains.tsx is already ~952 lines. Extracting CoverageMatrix is mandatory, not optional.

---

## Key Decisions Needing Human Input
1. What to do with "+" action — just navigate to `/job-choice/new?domainId=X` or also pass
   valueA/valueB? (Does JobChoiceNew.tsx support pre-populating value statements from URL params?)
2. Remove "Coverage" from domain NavTabs menu, or keep it? (I lean keep-but-move-to-link.)
3. Keep the Overview tab's existing action buttons (Create Vignette, Start pilot, etc.) or drop them?
   The PM brief says replace Overview content, but those buttons have navigational value.

---

## Files Touched
- `cloud/apps/web/src/pages/DomainCoverage.tsx` — extract CoverageMatrix component
- `cloud/apps/web/src/pages/Domains.tsx` — swap Overview tab content
- `cloud/apps/web/src/components/layout/NavTabs.tsx` — (maybe) remove /domains/coverage nav link
- New: `cloud/apps/web/src/components/domains/CoverageMatrix.tsx` — extracted shared component

## Files NOT Touched
- App.tsx router (keeping /domains/coverage route alive)
- All API operations files
- All test files (no test currently covers DomainCoverage)
