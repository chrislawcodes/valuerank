---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/spec.md"
artifact_sha256: "ae3b480012162fa284f1fbfb541a27451a6ae1491ee190de0f6df1e3e0fc6cec"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "The spec keeps the slice UI-only, defines explicit gating behavior, and preserves legacy-only behavior without changing backend contracts."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. High: The spec does not define a concrete rule for deciding when a surface is “fully V2-backed,” especially for pages that can render heterogeneous transcript rows. That makes the core mode-wiring requirement ambiguous and risky: an implementation could either mix legacy and canonical semantics on the same page or fall back to legacy mode too broadly. The spec needs a deterministic gating rule per page, not just a general “stay in legacy mode if not fully V2-backed” statement.

2. High: The spec asks to remove token columns, scenario columns, and normalization badges from presentation-only transcript tables, but it does not say what replaces those fields or how the table should behave when width, sorting, or row density changes. On a dense transcript surface, hiding columns without a replacement layout rule can easily break readability or responsive behavior. This is a feasibility gap, not a cosmetic one.

3. Medium: The copy cleanup requirement is too underspecified to be reliably implemented or tested. “Stop teaching score-first language” is broad, but the spec does not enumerate the exact headings, helper texts, tooltips, or accessibility labels that must change across the three pages and shared components. That leaves room for partial cleanup where some score-first language still leaks through.

4. Medium: The deterministic/fallback badge rule is incomplete. The spec says it should appear only when the transcript was not summarized deterministically and should be first in the decision summary area, but it does not define how that interacts with missing summaries, neutral outcomes, or multiple status badges. Without explicit precedence rules, the UI can end up showing misleading or inconsistent summary states.

## Residual Risks

- Even with correct page-level mode gating, any unlisted transcript-facing copy in empty states, hover text, or aria labels can still preserve score-first framing.
- If the data model allows partially migrated pages, the safest implementation may need to stay in legacy mode more often than product intent expects.
- Removing columns from transcript tables can still cause subtle regressions in layout, wrapping, and test snapshots on real datasets that the spec does not explicitly cover.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: The spec keeps the slice UI-only, defines explicit gating behavior, and preserves legacy-only behavior without changing backend contracts.
