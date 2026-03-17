# Domain Dropdown Cleanup Spec

## Goal

Simplify the Domains navigation dropdown so the common run-review and setup destinations are easier to find and the menu no longer duplicates vignette creation.

This feature updates the existing desktop and mobile navigation surfaces without changing routing, data loading, or page behavior behind those links.

## Problem

The current Domains menu is cluttered and flat:

- it still exposes `New Vignette` even though vignette creation is already reachable from the Vignettes page
- setup-oriented destinations are mixed into the same level as analysis destinations
- there is no direct `Trials` entry even though operators frequently need `/runs`

That combination makes the menu feel noisier than it needs to be and obscures the distinction between setup tasks and run-review tasks.

## Desired Behavior

The Domains navigation should behave like this:

1. keep `Overview`, `Vignettes`, `Domain Analysis`, and `Coverage` as direct Domains-menu destinations
2. add `Trials` as a direct Domains-menu destination that links to `/runs`
3. remove `New Vignette` from the Domains menu
4. add a `Domain Setup` item at the bottom of the Domains menu
5. make `Domain Setup` reveal a nested submenu containing:
   `Preamble`, `Context`, `Value Statements`, and `Level Presets`
6. preserve route highlighting so active setup pages still show as part of the Domains navigation context
7. keep mobile navigation semantically aligned with desktop so users do not learn two different information architectures

## In Scope

- `cloud/apps/web/src/components/layout/NavTabs.tsx`
- `cloud/apps/web/src/components/layout/MobileNav.tsx`
- `cloud/apps/web/tests/components/layout/NavTabs.test.tsx`
- `cloud/apps/web/tests/components/layout/MobileNav.test.tsx`
- workflow docs under `docs/workflows/domain-dropdown-cleanup/`

## Out Of Scope

- changing page routes or adding redirects
- changing the Vignettes page itself
- moving or renaming the underlying setup pages
- adding new domain-specific setup pages beyond the four named by the user
- broader navigation redesign outside the Domains menu

## Assumptions

- `Preamble` should link to `/preambles`.
- `Context` should link to `/domain-contexts`.
- `Value Statements` should link to `/value-statements`.
- `Level Presets` should link to `/level-presets`.
- `Trials` should link to `/runs` rather than a domain-filtered run list.
- The `Trials` label intentionally maps to the existing Runs page because that is the operator destination the user requested.
- The new nested structure only needs one additional submenu depth under Domains.

## Acceptance Criteria

1. Desktop Domains dropdown no longer shows `New Vignette`.
2. Desktop Domains dropdown shows `Trials` linking to `/runs`.
3. Desktop Domains dropdown ends with a `Domain Setup` item that expands to `Preamble`, `Context`, `Value Statements`, and `Level Presets`.
4. Active setup routes still highlight the Domains navigation context, and setup pages keep the `Domain Setup` grouping visibly active when appropriate.
5. Mobile navigation presents `Trials` within the Domains section and groups `Preamble`, `Context`, `Value Statements`, and `Level Presets` under a `Domain Setup` heading.
6. Existing validation and archive menu behavior remains intact.
7. Targeted nav tests cover the new structure and pass.
8. Manual smoke checking confirms the new `Domain Setup` submenu opens cleanly and layers correctly in the desktop dropdown.

## Verification

Minimum verification for this slice:

```bash
cd /private/tmp/valuerank-domain-dropdown-cleanup-11093/cloud
npm run test --workspace=@valuerank/web -- tests/components/layout/NavTabs.test.tsx tests/components/layout/MobileNav.test.tsx
npm run build --workspace=@valuerank/web
```

If possible before shipping, do a quick manual desktop smoke check on the Domains dropdown to confirm submenu layering and interaction feel.

## Workflow Note

The repo-owned feature workflow runner is not fully usable from this clean worktree because it is rooted to the main checkout and expects a missing `scripts/sync-codex-skills.py`. This feature still follows the same artifact structure and review stages manually, with Gemini 2.5 review records saved under `reviews/`.
