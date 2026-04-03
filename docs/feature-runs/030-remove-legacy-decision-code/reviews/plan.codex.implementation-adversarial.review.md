---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/030-remove-legacy-decision-code/plan.md"
artifact_sha256: "587a1726077d6b975f2458031ae03648e78c4f687d96a1d5068066c3041daa55"
repo_root: "."
git_head_sha: "5d04de64d2bf84e1434fd754cd77b7159a695474"
git_base_ref: "origin/main"
git_base_sha: "b60f7e7ff0708de6013e64f4045868895bbbcf6e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/feature-runs/030-remove-legacy-decision-code/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **High:** The plan makes the `decisionCode` fallback mandatory in `resolveTranscriptDecisionModel`, but it also says `decisionCode`/`decisionCodeSource` will be “not selected in queries.” Those two statements conflict unless the resolver’s upstream query is explicitly kept on the legacy columns. As written, the only supported path for old transcripts may not receive the field it needs.
- **Medium [UNVERIFIED]:** The Python rollout assumes every worker payload already contains canonical `direction`/`strength` and that removing `normalize_resolved_score` is safe everywhere. If any queued, retried, or replayed job still carries the legacy numeric shape, the deploy will regress those jobs immediately.
- **Medium [UNVERIFIED]:** The historical aggregate compatibility story is incomplete. The plan only names a frontend normalizer for old `scoreCounts`, but does not cover any backend reader, API resolver, export path, or analysis job that might consume stored aggregate blobs. Any non-frontend consumer of old runs will still break unless it gets the same dual-shape handling.
- **Low:** The parity regression test is underspecified. Once the legacy helpers are deleted, “compare `directionCounts` output vs. the old `scoreCounts` mapping” needs a frozen oracle or fixture table. Otherwise the test can end up proving the new code against itself instead of proving equivalence to the removed behavior.

## Residual Risks

- Older transcripts remain dependent on the single resolver fallback, so any regression there selectively breaks pre-V2 data.
- Stored runs with legacy `scoreCounts` will keep existing in mixed shape until every reader is updated or normalized.
- The rollout still assumes queue and replay behavior are cleanly separated from removed numeric fields; any straggler job can expose a missed compatibility path.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
