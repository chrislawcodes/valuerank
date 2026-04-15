---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/models-tab/tasks.md"
artifact_sha256: "4746a5920a6bc07659fb08ae18ea80df69efd420fa4a9097284e1394b30d8e01"
repo_root: "."
git_head_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- Medium: Slice B is self-blocking. `App.tsx` is wired to import and route `/models` before Slice C creates `cloud/apps/web/src/pages/Models.tsx`. Since B5/B7 require the web build to pass, B will fail unless you add a temporary stub page in B or reorder the work so the page exists first.
- Medium [UNVERIFIED]: The value-key list is not centralized. Slice A reads `DOMAIN_ANALYSIS_VALUE_KEYS` from the API side, while Slice C says the web side can define the array inline or import it from elsewhere. That creates a drift risk where the API query, matrix headers, and filters stop matching when the key list changes.
- Medium [UNVERIFIED]: The stability logic is under-specified. Slice A says `computeStabilityScore` should use the “spec MAD formula,” and Slice C says the tooltip should follow the “spec’s tooltip generation rule,” but the artifact does not pin down the exact formula or boundary text. That leaves room for inconsistent API/UI behavior on null scores, 1-domain cases, and threshold edges.

## Residual Risks

- The resolver assumes `parseSnapshotOutput(output)` yields a shape that matches the accumulator fields, but the artifact does not define malformed-output handling beyond “skip if null.” Bad snapshots may be silently dropped.
- The manual `schema.graphql` edit in Slice A can drift from the Pothos types if the API schema generation path changes, and the artifact does not add an explicit schema-regeneration check.
- The UI slices assume existing domain-selector hooks, drawer patterns, and auth/navigation behavior can be reused without extra wiring. If those assumptions are wrong, the page may need additional integration work outside these tasks.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 