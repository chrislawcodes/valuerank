---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/plan.md"
artifact_sha256: "318014dd758efdb309ddbda0bbce43cd02cda01054b15491f5af8262cab744aa"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "The plan now spells out precedence, provenance, and compatibility mapping in the contract recap and deterministic rules, so the implementation concerns are addressed at the planning layer. The API-layer placement is intentional for the initial shared adapter boundary, with later consumer wrappers handling reuse."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **High: The adapter is being placed in an API-GraphQL path even though the plan claims it is a shared boundary for later API, worker, and export reuse.** Putting the canonical decision logic in `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` makes the core contract live inside an API-specific layer, which will force cross-layer imports or a second relocation when phase 2/3 need the same logic elsewhere. That is a structural mismatch with the stated goal of a reusable pure adapter.
- **High: The plan does not define a complete precedence model for raw parser output, normalization, manual overrides, and compatibility scalars.** It names `direction`, `strength`, `parsePath`, `appliedDecision`, `previousDecisionCode`, `canonicalScore`, and `rawScore`, but it never states which source wins in each conflict case or how every branch maps to canonical vs legacy output. That leaves too much room for two implementations to both look “correct” while diverging on edge cases.
- **Medium: The provenance vocabulary is inconsistent and under-specified.** The architecture table lists `deterministic`, `manual`, `error`, and `unknown`, but the implementation notes add `fallback_resolved`, and the recap says malformed metadata and unrecognized parser states resolve to `unknown` or `error` without defining the boundary. If this is not frozen now, the persisted shape and tests can drift immediately.

## Residual Risks

- Some legacy transcripts may never be canonically decodable because they lack the pair or orientation metadata needed for the new contract. `LegacyDecisionCompat` keeps them usable, but canonical reporting will still have blind spots until there is a backfill or migration.
- The plan intentionally keeps only the current canonical override plus `previousDecisionCode`. If later audit or replay requirements need the full override chain, phase 2 will require schema work, not just adapter changes.
- The verification plan is still narrow. A grep check on docs and a designated fixture set can miss semantic regressions in examples, comments, or transcript shapes that are not in the chosen parity samples.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: The plan now spells out precedence, provenance, and compatibility mapping in the contract recap and deterministic rules, so the implementation concerns are addressed at the planning layer. The API-layer placement is intentional for the initial shared adapter boundary, with later consumer wrappers handling reuse.
