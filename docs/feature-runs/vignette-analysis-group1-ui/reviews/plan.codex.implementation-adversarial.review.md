---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/vignette-analysis-group1-ui/plan.md"
artifact_sha256: "bf95cc9ed9c657ffdddf9e8617b571f208b9685f0a254678a4dbccb2eeb195c4"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "The plan now covers empty and mixed data explicitly, removes the scenario sort fallback safely, and keeps the slice bounded to UI-only changes with a deterministic fallback order."
raw_output_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- [High] The badge rules are internally contradictory. The plan says to show `Manual` first, show `Fallback` only for `fallback_resolved`, and show no badge at all for exact/deterministic transcripts. But the implementation notes also say to “keep the deterministic/fallback badge visible only when a transcript is not deterministic, and render it first.” That leaves the exact precedence and visible set of badges undefined, so two pages can easily end up with different badge behavior for the same transcript.
- [High] The audit-mode gate is too brittle for real page states. It keys off “every transcript in the current surface” and the pages use their “current filtered transcript sets,” but the plan does not define how this behaves with partial loading, pagination, lazy hydration, or incremental fetches. That means the UI can stay stuck in legacy mode even after V2 data arrives, or flip between legacy and audit modes as the loaded set changes.
- [Medium] The ordering rule is underspecified and can still produce unstable row order. Removing the scenario fallback is fine, but “use created time and transcript id for that tie-break” does not define sort direction, null handling, or what happens when timestamps collide or drift. Without those details, row order can still jump between renders and break both user scanning and snapshot tests.
- [Medium] The copy map is incomplete for a shared UI change. It only names a few label swaps, but the plan also changes shared transcript presentation components. That leaves room for stale score-first wording in titles, helper text, empty states, tooltips, and accessibility labels that are not covered by the explicit replacements.
- [Low] The “fully V2-backed” requirement is not defined tightly enough for malformed or partially populated V2 objects. The plan requires `canonical.direction`, `canonical.strength`, and `raw.parseClass`, but it does not say which missing subfields force legacy mode versus `Unknown`. That ambiguity can create inconsistent fallback behavior across the shared components.

## Residual Risks

- Shared component changes still carry cross-page blast radius, especially for consumers not listed in the wave breakdown.
- Mixed-mode data sets remain a weak point if the gating logic is evaluated before all transcripts are loaded.
- The plan does not spell out exhaustive badge combinations, so edge cases like `manual + fallback`, malformed V2 payloads, and exact parses may still need judgment during implementation.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: The plan now covers empty and mixed data explicitly, removes the scenario sort fallback safely, and keeps the slice bounded to UI-only changes with a deterministic fallback order.
