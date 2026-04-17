---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/summarizer-fallback-removal/spec.md"
artifact_sha256: "a5fffec4f1942d2078eb8eeec1e93e27c139daa29469a650f6e6c542a3e696e0"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/summarizer-fallback-removal/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- High: [CODE-CONFIRMED] The spec’s “unresolvable” definition is too narrow. `persistSummarizeFailure` still sets `summarizedAt` when a summarize job fails, but the spec only counts `decision_code`, cached `decisionState`, or `parseClass`. That means failed summaries will be invisible to the new warning. The repo also already treats `parseClass === 'unparseable'` and `canonical.source === 'error'` as unresolved in the existing coverage UI, so this spec would undercount both failed jobs and legacy bad rows. [summarize-persistence.ts](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/api/src/queue/handlers/summarize-persistence.ts#L250) [analysisCoverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/web/src/utils/analysisCoverage.ts#L78) [AnalysisTranscripts.tsx](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/web/src/pages/AnalysisTranscripts.tsx#L84)

- Medium: [CODE-CONFIRMED] The spec uses `decisionCodeSource`, but the worker returns `decisionSource`, and only the persistence layer renames that into stored `decisionCodeSource`. The spec needs to pin which layer it is talking about, or implementation/tests will assert the wrong field name. [summarize.py](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/workers/summarize.py#L159) [summarize-persistence.ts](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/api/src/queue/handlers/summarize-persistence.ts#L40)

- Medium: [CODE-CONFIRMED] The per-model breakdown is underspecified for model aliasing and provider prefixes. The summarize handler persists prefixed IDs like `provider:model`, while the existing coverage helper normalizes model IDs when matching counts. A naïve exact-string breakdown in the new warning can split one logical model across multiple buckets or disagree with other run pages. [summarize-transcript.ts](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L172) [analysisCoverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/practical-noyce-1db12d/cloud/apps/web/src/utils/analysisCoverage.ts#L153)

## Residual Risks

- I could not verify the exact run-detail API/MCP response shape from the provided code, so there is still integration risk in how the new count is surfaced.
- If the intent is to define a narrower warning than the existing “unresolved transcript” UI, that policy needs to be stated explicitly; otherwise different pages will keep counting different things.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 