## Method
claude-direct

## Pre-implementation findings
<!-- Every real issue caught during plan self-review, before writing code -->
<!-- Format: - [acted on: yes/no] description -->
- [no] VALUE TOKEN MISMATCH: Coverage matrix valueA/valueB are Schwartz canonical names (e.g. `Self_Direction_Thought`). JobChoiceNew.tsx selects value statements by their database ID, not by token. Passing valueA/valueB as URL params to `/job-choice/new` will have no effect on pre-population unless JobChoiceNew.tsx is extended to look up statements by token. This makes the "+" UX misleading unless we handle it explicitly.
- [no] FILE SIZE VIOLATION: Domains.tsx is already 952 lines. DomainCoverage.tsx is 710 lines. Naively embedding the coverage component logic into Domains.tsx would push it past 1400 lines — over 3x the 400-line limit. Extraction of a CoverageMatrix component is required before merging, not optional.
- [no] URL STATE CONFLICT: DomainCoverage.tsx syncs `domainId`, `signature`, and `modelIds` to the URL. Domains.tsx already syncs `domainId` and `tab` to the URL. Embedding coverage in Domains.tsx risks clobbering each other's URL writes unless the embedded component does NOT sync domainId (it can derive it from the outer component's selected domain).
- [no] DOMAINS.TSX DEFAULT TAB IS 'vignettes', NOT 'overview': Line 104-107 shows initial tab defaults to `'vignettes'`, not `'overview'`. The coverage matrix will be hidden on first load unless this default changes, which is a behavior change worth calling out explicitly.
- [no] OVERVIEW TAB ONLY VISIBLE FOR DOMAIN-SPECIFIC SELECTION: Lines 278-283 reset `activeTab` to `'vignettes'` whenever `selectedFolder` is `'all'` or `'none'`. The coverage matrix (and the Overview tab entirely) only makes sense for a specific domain — this is correct behavior, but means "+" on a cell must always have domainId available (no edge case there).
- [no] SIGNATURE SELECTION ASYNC TIMING: CoverageMatrix will need to replicate the `signatureSelectionReady` gate logic from DomainCoverage.tsx — the matrix query must NOT fire until a valid signature is selected (or all-signatures mode is set). If this gate is dropped during extraction, the query will fire prematurely and return wrong data.
- [no] COPY VISUAL BUTTON: The `<CopyVisualButton>` in DomainCoverage.tsx needs a `targetRef` pointing at the table div. When embedded in the Overview tab, the ref is still valid, but if the user navigates away and back, the ref needs to re-mount cleanly. Not a blocker, just test it.
- [no] LEGACY QUERY FALLBACK: DomainCoverage.tsx has a `useLegacyQuery` fallback for older API environments (no `signature` argument). This fallback logic must be preserved in CoverageMatrix or the embedded component will break against older API deployments.
- [no] SETUP GUARD NOT SURFACED IN OVERVIEW: Currently the Overview tab shows setup readiness warnings. If we replace that content with the coverage matrix, a domain with 0 vignettes will render "No coverage data available for this domain" with no guidance on why or what to do next. Need a brief empty-state message pointing to Setup/Vignettes tab.

## Human interruptions

### Interruption 1 — 4 scoping decisions (2026-03-30)

**Q-A: "+" action on uncovered cells**
Q: What should happen when a user clicks/hovers an uncovered cell — navigate to `/job-choice/new?domainId=X&valueA=Y&valueB=Z`, or just show a message?
A: No "+" button at all. Just show the coverage matrix so users can see gaps. They use the existing workflow to create vignettes. Remove this from scope entirely.

**Q-B: Default tab**
Q: Should the default tab on `/domains` change from 'vignettes' to 'overview' so the coverage matrix is the first thing users see?
A: Yes, change the default tab from 'vignettes' to 'overview'.

**Q-C: Remove "Coverage" from nav**
Q: Should "Coverage" be removed from the top-level NavTabs Domains dropdown, since it will live inside the domain page Overview tab?
A: Yes, remove "Coverage" from the top nav dropdown entirely. It will live inside the domain page Overview tab only.

**Q-D: Existing Overview action buttons**
Q: The current Overview tab has action buttons (Create Vignette, Start pilot, etc.). Keep, drop, or move them?
A: Keep them but find an appropriate place within the new Overview tab layout. They should not be dropped since those actions are useful — just need to coexist with the coverage matrix.

## Post-merge bugs
- none
