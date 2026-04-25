---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/spec.md"
artifact_sha256: "8f52757dc3aa429f52e376eec42ab8818aceb9d6539785ce3133e10fff15c5fc"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (jobChoiceValueFirst not paired-batch-guarded) — already addressed in residual risks (§11 R3b); plan-phase will add a defensive test. MED (broken-pair glossary too strong) — accepted; clarified that incompleteBatchCount only counts COMPLETED-but-incomplete runs, not failed/cancelled (this is current code behavior, unchanged). LOW (UI fallback) — already addressed in §2b."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- Medium: The spec treats `jobChoiceValueFirst` as a pairing-only signal, but the write path does not enforce that invariant. [`start.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/services/run/start.ts#L220) persists arbitrary `configExtras`, and [`execute-runs.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts#L131) forwards caller-supplied extras unchanged. That means a malformed or future non-paired launch can still stamp `jobChoiceValueFirst` and get counted by the new `pairedBatchCount` logic. [CODE-CONFIRMED]

- Medium: The spec’s “broken pair” / `Incomplete Batch` wording overstates what the current query can represent. [`domain-coverage.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L152) only scans `status: 'COMPLETED'` runs before completeness checks, and the incomplete counter is incremented only inside that loop. A companion that fails or is cancelled before completion will not appear in `incompleteBatchCount` at all, so the proposed glossary text is stronger than the code path supports. [CODE-CONFIRMED]

- Low: The refactor does not change the primary visible number in the common default-model UI path. [`CoverageCell.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/web/src/components/domains/CoverageCell.tsx#L43) uses `minTrialCount` when per-model data exists, and only falls back to `pairedBatchCount` when it does not. In the usual case, the new semantic only reaches the analysis-link query string, not the grid digit the operator sees. [CODE-CONFIRMED]

## Residual Risks

- Legacy runs without `jobChoiceValueFirst` will still be excluded from the new directional count. That is intentional in the spec, but it means older value pairs can drop to `0` even when `batchCount` stays non-zero.

- The spec’s fallback for more than two direction tokens is still heuristic. The provided code does not enforce the “exactly two directions” assumption, so if data drift ever introduces extra tokens, the count will depend on the chosen fallback rather than a hard invariant.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (jobChoiceValueFirst not paired-batch-guarded) — already addressed in residual risks (§11 R3b); plan-phase will add a defensive test. MED (broken-pair glossary too strong) — accepted; clarified that incompleteBatchCount only counts COMPLETED-but-incomplete runs, not failed/cancelled (this is current code behavior, unchanged). LOW (UI fallback) — already addressed in §2b.
