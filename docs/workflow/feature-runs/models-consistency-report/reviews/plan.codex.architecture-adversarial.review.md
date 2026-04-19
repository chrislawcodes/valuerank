---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/plan.md"
artifact_sha256: "708b9e9c23963af06c3721f53052dda7263309da83183011e62e94cbeb099ddb"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "accepted after manual reconciliation; findings reviewed and either fixed or documented as residual risks"
---

# Review: plan architecture-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The Repeatability metric depends on per-scenario `(matches, trials)` data that the current typed analysis contract does not expose. The public reliability shape only carries aggregate fields, and the parser only accepts that aggregate shape, so the plan would have to depend on an undocumented private JSON structure or a transcript recount fallback that it does not actually specify. See [analysisSemantics.types.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.types.ts#L82) and [analysisSemantics.utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts#L173).

- MEDIUM [CODE-CONFIRMED] The plan splits scope state between the existing Models page and the new Consistency route, but the current Models page keeps domain and signature in local React state and defaults to “all domains.” Because the plan also says `Models.tsx` stays untouched, the two tabs will not round-trip the same scope on reload or browser back/forward, and the proposed “first domain” fallback would not match the current Matrix default. See [Models.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/Models.tsx#L28) and [Models.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/Models.tsx#L119).

- LOW [CODE-CONFIRMED] The order-effect drill-down contract is brittle because `repeatPattern` is treated as free-form text in the transcript stack, not as a canonical enum. Only `stable`, `softLean`, `torn`, and `noisy` get special labels; anything else renders raw. If the report emits `paired-stability`, the target page will surface that literal string instead of a meaningful label. See [analysisTranscriptParams.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/utils/analysisTranscriptParams.ts#L73) and [PairedStabilityView.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/PairedStabilityView.tsx#L42).

## Residual Risks

- The plan still needs a pinned source contract for the per-scenario reliability payload. If that data only exists in a private JSON blob, the resolver will remain coupled to an unstable shape even after implementation.

- The Coherence edge-case rule still needs to be frozen before coding. The plan mixes “p-value decides indeterminate” with “exclude unstable small-n pairs,” and that choice changes the denominator as soon as a pair sits near the threshold.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
