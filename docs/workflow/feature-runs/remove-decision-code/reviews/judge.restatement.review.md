---
reviewer: "gpt-5.2"
lens: "restatement-judge"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "15a9e6d05277f3252db61fa592482c5d7455749f9598d3b9f074a0bffa06707f"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Block. The supplied earlier-round record says \"No prior findings yet.\", so none of the latest findings can be a RESTATEMENT under the stated rule, which requires an earlier round that raised the same concern plus an orchestrator response..."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/judge.restatement.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan restatement-judge

## Findings

Block. The supplied earlier-round record says "No prior findings yet.", so none of the latest findings can be a RESTATEMENT under the stated rule, which requires an earlier round that raised the same concern plus an orchestrator response that substantively addressed it. Classifications: plan.codex.architecture-adversarial.review#high-1 NEW: it surfaces a new failure mode where a W9 backfill that calls resolveCanonicalDecision can preserve stale cached canonicals because the resolver prefers any cached canonical with decisionState !== 'unknown' before recomputing from raw evidence. plan.codex.architecture-adversarial.review#high-2 NEW: it surfaces two new failure modes, that refusal is not carried through RawDecisionEvidence/DecisionModelInput/buildRawDecisionEvidence, and that cached refusal rows still fall through to unknown in resolveCanonicalDecision. plan.codex.architecture-adversarial.review#medium-3 NEW: it surfaces a new failure mode where W10 treats canonicalDecision.decisionState === 'unknown' as parser-only even though the resolver uses unknown for multiple non-parser cases, so a reparse filter will over-include unrecoverable rows and miss some relevant ones. plan.codex.implementation-adversarial.review#medium-1 NEW: it surfaces a new failure mode where the planned test rewrite remaps current 'other'/None outcomes to 'unparseable' even though the worker currently emits parseClass 'ambiguous', which would drop coverage for real ambiguity paths. plan.codex.implementation-adversarial.review#medium-2 NEW: it surfaces a new failure mode where cacheVersion: 1 conflates refusal and unknown, so any retained reparse script run before the apply migration finishes can mis-target refusal rows as parse failures. plan.codex.implementation-adversarial.review#low-3 NEW: it surfaces a new failure mode where W9 depends on importing live resolver code into a standalone cloud/scripts entrypoint without a proven bootstrap path. plan.gemini.testability-adversarial.review#high-1 NEW, #high-2 NEW, #medium-3 NEW, #medium-4 NEW, #low-5 NEW, and #low-6 NEW: no earlier round exists to restate, and the prompt omits their bodies so no narrower comparison is possible. The 70% restatement threshold is not met; in the supplied record the latest round is still surfacing new issues rather than recycling addressed ones.

## Residual Risks

- earlier-rounds-summary :: prior findings - No prior findings yet.
- plan.codex.architecture-adversarial.review.md :: high-1 - The proposed migration primitive in W9 is wrong for the job. The live resolver explicitly prefers any cached canonical with `decisionState !== 'unknown'` ... That means a backfill that calls `resolveCanonicalDecision` can preserve already-bad cached canonicals instead of recomputing them, so the drift the plan is trying to remove may survive the migration.
- plan.codex.architecture-adversarial.review.md :: high-2 - The refusal refactor is incomplete in two places. First, the plan says the resolver should read `decisionMetadata.refusal`, but `RawDecisionEvidence` and `DecisionModelInput` do not carry any refusal bit today ... Second, even if refusal reaches the raw path, the cached-decision branch in `resolveCanonicalDecision` never special-cases `decisionState: 'refusal'`, so a cached refusal row will still fall through to unknown ...
- plan.codex.architecture-adversarial.review.md :: medium-3 - W10 assumes `canonicalDecision.decisionState === 'unknown'` now means “parser failure only,” but the resolver uses `"unknown"` for several unrelated cases ... A reparse filter built on that field will pull in rows that cannot be recovered by reparsing and can still miss rows whose failure mode is not parsing.
- plan.codex.implementation-adversarial.review.md :: medium-1 - W3’s test-rewrite guidance maps current `"other"`/`None` cases to `"unparseable"`, but the worker code does not do that. In [summarize.py], unresolved cases from `extract_decision_result()` are returned with `parseClass: "ambiguous"` when `decision_code == "other"` ... If the rewrite only checks for `unparseable` or `refusal` absence, it will stop protecting the ambiguity paths that actually exist today.
- plan.codex.implementation-adversarial.review.md :: medium-2 - W10 assumes `canonicalDecision.decisionState === "unknown"` means “pure parser failure,” but the current code explicitly says v1 rows conflate refusal and unknown ... That means any retained `backfill-reparse-decisions.ts` run before the `--apply` migration finishes can still mis-target refusal rows as parse failures.
- plan.codex.implementation-adversarial.review.md :: low-3 - W9 depends on importing the live resolver into a standalone script, but the provided code only shows the current migration as a self-contained module with local helpers. The plan does not show the workspace/bootstrap path needed for a `cloud/scripts` entrypoint to safely import application resolver code, so the migration’s execution path is not yet proven.
- plan.gemini.testability-adversarial.review.md :: high-1 - HIGH plan.gemini.testability-adversarial.review#high-1: [CODE-CONFIRMED]
- plan.gemini.testability-adversarial.review.md :: high-2 - HIGH plan.gemini.testability-adversarial.review#high-2: [CODE-CONFIRMED]
- plan.gemini.testability-adversarial.review.md :: medium-3 - MEDIUM plan.gemini.testability-adversarial.review#medium-3: [UNVERIFIED]
- plan.gemini.testability-adversarial.review.md :: medium-4 - MEDIUM plan.gemini.testability-adversarial.review#medium-4: [UNVERIFIED]
- plan.gemini.testability-adversarial.review.md :: low-5 - LOW plan.gemini.testability-adversarial.review#low-5: [UNVERIFIED]
- plan.gemini.testability-adversarial.review.md :: low-6 - LOW plan.gemini.testability-adversarial.review#low-6: [UNVERIFIED]

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "earlier-rounds-summary",
      "quote": "No prior findings yet.",
      "section": "prior findings"
    },
    {
      "artifact": "plan.codex.architecture-adversarial.review.md",
      "quote": "The proposed migration primitive in W9 is wrong for the job. The live resolver explicitly prefers any cached canonical with `decisionState !== 'unknown'` ... That means a backfill that calls `resolveCanonicalDecision` can preserve already-bad cached canonicals instead of recomputing them, so the drift the plan is trying to remove may survive the migration.",
      "section": "high-1"
    },
    {
      "artifact": "plan.codex.architecture-adversarial.review.md",
      "quote": "The refusal refactor is incomplete in two places. First, the plan says the resolver should read `decisionMetadata.refusal`, but `RawDecisionEvidence` and `DecisionModelInput` do not carry any refusal bit today ... Second, even if refusal reaches the raw path, the cached-decision branch in `resolveCanonicalDecision` never special-cases `decisionState: 'refusal'`, so a cached refusal row will still fall through to unknown ...",
      "section": "high-2"
    },
    {
      "artifact": "plan.codex.architecture-adversarial.review.md",
      "quote": "W10 assumes `canonicalDecision.decisionState === 'unknown'` now means \u201cparser failure only,\u201d but the resolver uses `\"unknown\"` for several unrelated cases ... A reparse filter built on that field will pull in rows that cannot be recovered by reparsing and can still miss rows whose failure mode is not parsing.",
      "section": "medium-3"
    },
    {
      "artifact": "plan.codex.implementation-adversarial.review.md",
      "quote": "W3\u2019s test-rewrite guidance maps current `\"other\"`/`None` cases to `\"unparseable\"`, but the worker code does not do that. In [summarize.py], unresolved cases from `extract_decision_result()` are returned with `parseClass: \"ambiguous\"` when `decision_code == \"other\"` ... If the rewrite only checks for `unparseable` or `refusal` absence, it will stop protecting the ambiguity paths that actually exist today.",
      "section": "medium-1"
    },
    {
      "artifact": "plan.codex.implementation-adversarial.review.md",
      "quote": "W10 assumes `canonicalDecision.decisionState === \"unknown\"` means \u201cpure parser failure,\u201d but the current code explicitly says v1 rows conflate refusal and unknown ... That means any retained `backfill-reparse-decisions.ts` run before the `--apply` migration finishes can still mis-target refusal rows as parse failures.",
      "section": "medium-2"
    },
    {
      "artifact": "plan.codex.implementation-adversarial.review.md",
      "quote": "W9 depends on importing the live resolver into a standalone script, but the provided code only shows the current migration as a self-contained module with local helpers. The plan does not show the workspace/bootstrap path needed for a `cloud/scripts` entrypoint to safely import application resolver code, so the migration\u2019s execution path is not yet proven.",
      "section": "low-3"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "HIGH plan.gemini.testability-adversarial.review#high-1: [CODE-CONFIRMED]",
      "section": "high-1"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "HIGH plan.gemini.testability-adversarial.review#high-2: [CODE-CONFIRMED]",
      "section": "high-2"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "MEDIUM plan.gemini.testability-adversarial.review#medium-3: [UNVERIFIED]",
      "section": "medium-3"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "MEDIUM plan.gemini.testability-adversarial.review#medium-4: [UNVERIFIED]",
      "section": "medium-4"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "LOW plan.gemini.testability-adversarial.review#low-5: [UNVERIFIED]",
      "section": "low-5"
    },
    {
      "artifact": "plan.gemini.testability-adversarial.review.md",
      "quote": "LOW plan.gemini.testability-adversarial.review#low-6: [UNVERIFIED]",
      "section": "low-6"
    }
  ],
  "judge": "restatement",
  "model": "gpt-5.2",
  "reasoning": "Block. The supplied earlier-round record says \"No prior findings yet.\", so none of the latest findings can be a RESTATEMENT under the stated rule, which requires an earlier round that raised the same concern plus an orchestrator response that substantively addressed it. Classifications: plan.codex.architecture-adversarial.review#high-1 NEW: it surfaces a new failure mode where a W9 backfill that calls resolveCanonicalDecision can preserve stale cached canonicals because the resolver prefers any cached canonical with decisionState !== 'unknown' before recomputing from raw evidence. plan.codex.architecture-adversarial.review#high-2 NEW: it surfaces two new failure modes, that refusal is not carried through RawDecisionEvidence/DecisionModelInput/buildRawDecisionEvidence, and that cached refusal rows still fall through to unknown in resolveCanonicalDecision. plan.codex.architecture-adversarial.review#medium-3 NEW: it surfaces a new failure mode where W10 treats canonicalDecision.decisionState === 'unknown' as parser-only even though the resolver uses unknown for multiple non-parser cases, so a reparse filter will over-include unrecoverable rows and miss some relevant ones. plan.codex.implementation-adversarial.review#medium-1 NEW: it surfaces a new failure mode where the planned test rewrite remaps current 'other'/None outcomes to 'unparseable' even though the worker currently emits parseClass 'ambiguous', which would drop coverage for real ambiguity paths. plan.codex.implementation-adversarial.review#medium-2 NEW: it surfaces a new failure mode where cacheVersion: 1 conflates refusal and unknown, so any retained reparse script run before the apply migration finishes can mis-target refusal rows as parse failures. plan.codex.implementation-adversarial.review#low-3 NEW: it surfaces a new failure mode where W9 depends on importing live resolver code into a standalone cloud/scripts entrypoint without a proven bootstrap path. plan.gemini.testability-adversarial.review#high-1 NEW, #high-2 NEW, #medium-3 NEW, #medium-4 NEW, #low-5 NEW, and #low-6 NEW: no earlier round exists to restate, and the prompt omits their bodies so no narrower comparison is possible. The 70% restatement threshold is not met; in the supplied record the latest round is still surfacing new issues rather than recycling addressed ones.",
  "timestamp": "2026-04-19T12:00:00-07:00",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Block. The supplied earlier-round record says "No prior findings yet.", so none of the latest findings can be a RESTATEMENT under the stated rule, which requires an earlier round that raised the same concern plus an orchestrator response...
