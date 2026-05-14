---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/internal-kappa-overlay/spec.md"
artifact_sha256: "febbce1d68c771ed0f30dea27b7578d58132f025cef473d65d3279596ea00613"
repo_root: "."
git_head_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
git_base_ref: "origin/main"
git_base_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Codex feasibility review completed across rounds 1, 4, and 5 (other attempts hit the runner's 120s/300s infra timeout — not review failures). All findings addressed in spec.md: (R1) cluster-scope vs kappa-scope mismatch -> added 'Cluster scope vs. kappa scope' section, full-coverage rule, verified risk; (R4) paused/error states beyond fetching -> 4-case status enum; (R4) 'adjust Models filter' impossible-fix for deprecated models -> tooltip reworded cause-agnostic; (R4) signature-scoped metric -> help-panel clause + risk; (R5) status-bucket conflation -> 'unavailable' made intentionally cause-agnostic; (R5) a11y cluster-card button accessible name -> explicit requirement + AC that button name stays exactly member-label text; (R5) empty-model-selection state -> 'needs-more-models' status with actionable tooltip. FF's 1+1 spec review budget is well exceeded; not re-running."
raw_output_path: "docs/workflow/feature-runs/internal-kappa-overlay/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "File restored by the orchestrator from the genuine completed Codex feasibility review (direct run, 2026-05-14). The runner's checkpoint/repair re-runs timed out repeatedly on the 120s/300s Codex infra ceiling and overwrote the completed review with a timeout stub; this restores the actual review content unchanged. All three findings were addressed in spec.md before restore — see resolution_note."
---

# Review: spec feasibility-adversarial

## Findings

1. [CODE-CONFIRMED] Medium: The status model in the spec collapses a real "no shared scenarios" result into the same `unavailable` bucket as "not requested" or "errored," which means the required per-cluster tooltip cannot be shown when the entire agreement map comes back empty. `ModelsGroups.tsx` filters out rows with `totalCells === 0` and returns `undefined` when nothing remains. That makes an all-empty-but-valid result indistinguishable from a paused or failed query.

2. [CODE-CONFIRMED] Medium: The spec does not account for preserving the cluster card button's accessible name once the overlay text is added. The current tests assert exact button names like `Model A` and `Claude Sonnet 4.5`, and the card is currently a `Button` whose label comes from its text content. If the new overlay is rendered inside that button without being hidden from the accessible name, it will change the name and break existing behavior.

3. [CODE-CONFIRMED] Low: The spec ignores the supported empty-model-selection state. The context bar already allows `Clear all`, which can set `selectedModelIds` to `[]`, and `ModelsGroups.tsx` pauses the agreement query whenever fewer than two models are visible. In that normal user state, the overlay would present the same "unavailable" placeholder as a real data problem, so users cannot tell "I cleared the filter" from "agreement data is missing."

## Residual Risks

- Narrow selections will still produce a lot of placeholders because many domain clusters will not be fully covered by the visible model set.
- The overlay only works if cluster member IDs and agreement-query model IDs stay in the same ID space; if they drift, the feature will silently fall back to placeholders.

## Resolution
- status: accepted
- note: Codex feasibility review completed across rounds 1, 4, and 5 (other attempts hit the runner's 120s/300s infra timeout — not review failures). All findings addressed in spec.md: (R1) cluster-scope vs kappa-scope mismatch -> added 'Cluster scope vs. kappa scope' section, full-coverage rule, verified risk; (R4) paused/error states beyond fetching -> 4-case status enum; (R4) 'adjust Models filter' impossible-fix for deprecated models -> tooltip reworded cause-agnostic; (R4) signature-scoped metric -> help-panel clause + risk; (R5) status-bucket conflation -> 'unavailable' made intentionally cause-agnostic; (R5) a11y cluster-card button accessible name -> explicit requirement + AC that button name stays exactly member-label text; (R5) empty-model-selection state -> 'needs-more-models' status with actionable tooltip. FF's 1+1 spec review budget is well exceeded; not re-running.
