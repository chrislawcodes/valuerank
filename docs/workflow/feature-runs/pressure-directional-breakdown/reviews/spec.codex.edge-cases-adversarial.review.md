---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/pressure-directional-breakdown/spec.md"
artifact_sha256: "858eb043e826237b9368f3e71cef00403179abdd7add72ed823ee17ca9cc60a5"
repo_root: "."
git_head_sha: "c4ae5bdb840b796e23fd5ea549b6f74fa745764f"
git_base_ref: "origin/main"
git_base_sha: "60c4e4307bf423c0f688341736c7da7f0482a090"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "modelId confirmed in generated/graphql.ts PressureSensitivityQuery response. Minimum pairs threshold accepted as residual risk with Pairs column providing context. Silent omission is intentional behavior."
raw_output_path: "docs/workflow/feature-runs/pressure-directional-breakdown/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **Medium:** The ranking is driven only by `|gap|`, but the spec only excludes models with zero valid pairs. That means a model with 1 valid pair can outrank a model with 50 valid pairs if its gap is larger by chance. For a table meant to answer whether pressure works both ways, this is a real edge-case flaw because it can surface noise as the top result. The spec should either add a minimum `pairsUsed` threshold, show a confidence cue, or explicitly say that sample size is intentionally ignored.

- **Medium [UNVERIFIED]:** FR-004 depends on a stable `modelId` tie-break, but the artifact never states that `PressureSensitivityModel` actually exposes `modelId`. If that field is missing or not stable in the existing codebase, the promised deterministic ordering cannot be implemented as written. This needs confirmation against the actual type.

- **Low:** Models with `pairsUsed = 0` are silently omitted, and the spec does not require any empty-state note or omission count. In adversarial data, that makes it impossible to tell whether a model is absent because it had no usable pairs or because it was never part of the dataset. That is a weak assumption for a table meant to explain directionality across models.

## Residual Risks

- The spec still leaves floating-point edge cases open, especially `-0` and values very close to zero, which can make the sign color and the formatted string look inconsistent.
- The test plan does not cover the `modelId` tie-break branch separately, so if duplicate visible labels exist, deterministic ordering is still not really proven.
- The component can disappear entirely when all models have no valid pairs, which may be correct by spec but still creates a silent data-loss experience on the page.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: modelId confirmed in generated/graphql.ts PressureSensitivityQuery response. Minimum pairs threshold accepted as residual risk with Pairs column providing context. Silent omission is intentional behavior.
