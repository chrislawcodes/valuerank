---
reviewer: codex
lens: correctness
stage: diff
artifact_path: docs/workflows/domain-first-site-ia-migration/reviews/wave-6-archive-retirement.diff.patch
artifact_sha256: 7af4e585fc84d14e9202e790dd964bc27b173a746a6d9db4e2949bb26eff2b06
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "No blocking correctness issue remains in the Wave 6 slice; archive-prefixed survey routes are now canonical, compatibility aliases preserve search params, and the updated navigation/tests match that retirement model."
raw_output_path: ""
---

# Review: wave-6-archive-retirement correctness

## Findings

No blocking correctness issue found in the Wave 6 slice.

The implementation matches the intended archive-retirement behavior:

1. `/archive/surveys` and `/archive/survey-results` are now the canonical mounted routes, while `/survey` and `/survey-results` redirect through `LegacyRouteRedirect`, preserving query strings and hashes instead of dropping route state.
2. Archive navigation now points at the canonical archive-prefixed paths while still treating the older survey aliases as active compatibility paths through explicit alias handling in both desktop and mobile nav.
3. `ArchiveHome`, `Survey`, and `SurveyResults` now consistently frame those surfaces as legacy or historical work, which strengthens the `Archive` information scent without removing the underlying workflows.
4. survey-page navigation that previously pointed at `/survey-results` now points at the canonical archive-prefixed results route, so newly created in-app links do not keep teaching the legacy URL shape.
5. focused tests cover the canonical hrefs, the alias redirects, and the updated legacy labels across app routing, archive home, desktop nav, mobile nav, and layout rendering.

Targeted verification passed:

1. `npm run typecheck --workspace=@valuerank/web`
2. `npm test --workspace=@valuerank/web -- tests/App.test.tsx tests/pages/ArchiveHome.test.tsx tests/components/layout/NavTabs.test.tsx tests/components/layout/MobileNav.test.tsx tests/components/layout/Layout.test.tsx`

## Residual Risks

1. The legacy survey surfaces are still functionally live, so this wave retires the route model and labeling before any deeper backend archive classification exists. That is intentional, but it means `Archive` is still partly a navigation truth rather than a fully enforced data classification boundary.
2. The `MobileNav` tests still emit the existing `act(...)` warning pattern. The tests pass and the warning predates this wave, but it remains cleanup debt.
3. The route compatibility matrix and file inventory are now updated to the archive-prefixed canonical paths; any external docs or bookmarks outside this workflow packet will still need to catch up separately.

## Resolution
- status: accepted
- note: No blocking correctness issue remains in the Wave 6 slice; archive-prefixed survey routes are now canonical, compatibility aliases preserve search params, and the updated navigation/tests match that retirement model.
