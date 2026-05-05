---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/vignette-paired-analysis/spec.md"
artifact_sha256: "6f578c0a2da5e111c03f9ba4bf3c1ded5e0e8fe1f203d0ae283e9de1f9ad457d"
repo_root: "."
git_head_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
git_base_ref: "origin/main"
git_base_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Cap reached. Findings addressed iteratively in spec.md."
raw_output_path: "docs/workflow/feature-runs/vignette-paired-analysis/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **High:** The default signature rule is unsafe as written. It says to derive `signature` from the most recent completed run across both vignettes, but it never requires that both vignettes actually have runs for that signature. If the two sides have different recent histories, the page can open on a signature that only one side supports and quietly degrade into a one-direction view. The spec should require the most recent **shared** signature, or fail explicitly when no shared completed signature exists.
- **High:** Companion-collision handling is contradictory. One part of the spec says a duplicate `pair_key` must hard-fail with `pair_key_companion_collision` and surface a non-dismissible alert. Another part says to “log a warn and pick most recent.” Those are mutually exclusive behaviors, so the implementation target is not actually defined. Pick one policy and remove the other.
- **Medium:** The spec says it is retiring the run-centric companion heuristic, but then it preserves `findCompanionPairedRun` in a new `legacyCompanionPairedRun.ts` utility for `AnalysisConditionDetail.tsx`. That keeps the old pairing model alive in parallel with the new server-resolved model. The cleanup is therefore incomplete, and the repo will still contain two different ways to decide what “paired” means.

## Residual Risks

- **[UNVERIFIED]** The plan assumes the existing pressure-sensitivity service can accept `definitionIds` without `domainId` and still resolve every downstream filter correctly. If any hidden callsite still expects domain-scoped inputs, the new path will need extra plumbing.
- The synchronous no-cache path may be fine for most vignette pairs, but there is no fallback if a pair has unusually large run volume. The spec adds telemetry, not a mitigation.
- The collision UX depends on every frontend consumer treating `excludedDefinitions.reason` as authoritative. If one page ignores that reason, the same data-integrity problem may show up as a silent partial result instead of the intended alert.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Cap reached. Findings addressed iteratively in spec.md.
