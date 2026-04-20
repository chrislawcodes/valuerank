---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/spec.md"
artifact_sha256: "f0de8d8cd4c87502e36b8eab7868fc59a0a85c228f48f1ba7ed985da197c2bf0"
repo_root: "."
git_head_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Contradictory Migration Logic (Severity: HIGH)

The spec is fundamentally inconsistent about the core migration strategy.

-   `FR-008` and the `Correctness-critical mapping` table specify a direct, deterministic transformation of existing structured data from the database (e.g., `decisionCode`, `orientationFlipped`).
-   `Assumption #8`, however, suggests reusing the `reparse-decision-stdin.py` script. This script does not perform a simple mapping; it re-runs the full, original `extract_decision_result` parser against raw transcript content.

These are two different migration strategies. A simple mapping preserves the previously determined `decisionCode` and transforms it. A re-parse executes new logic that could yield a completely different decision from what's currently stored, especially given recent parser fixes. The migration could unintentionally change decisions it was only meant to reformat.

**Evidence**: `[CODE-CONFIRMED]` — The provided code for `cloud/scripts/reparse-decision-stdin.py` confirms it calls `extract_decision_result(payload["transcriptContent"])`, which is a full re-parse from raw text, not a mapping of structured fields as described in `FR-008` and the truth table.

### 2. Ambiguous Consumer Tolerance for New "refusal" State (Severity: MEDIUM)

The spec claims existing read paths will tolerate the new `decisionState: "refusal"` without changes, but this assumption is not sufficiently justified.

-   `US2, Acceptance #4` states, "Callers that see `refusal` receive it as an unknown decisionState — not a crash." This implies a transformation layer or a tolerant consumer.
-   However, the spec does not detail *how* this is guaranteed. If a downstream consumer uses a `switch` statement on `decisionState` without a `default` case, or validates against a strict enum, introducing the `"refusal"` value could cause a runtime crash.

The assertion "No consumer needs to change in this PR" is a high bar that seems inadequately verified. Simply passing a new, unexpected enum value to existing code is not guaranteed to be safe.

**Evidence**: `[UNVERIFIED]` — The relevant consumer code (e.g., `resolveTranscriptDecisionModel`, analysis UI components) was not provided to confirm its tolerance.

### 3. Incomplete Acceptance Criteria for Data Preservation (Severity: LOW)

The acceptance criteria for data preservation are incomplete.

-   `US1, Acceptance #4` covers the case where `decisionCode = "other"` or is missing, stating the `v1` canonical is preserved.
-   However, it omits the common case from `FR-008`: a row with a valid `decisionCode` (e.g., `"5"`) AND an existing `v1` canonical. The spec states the migration will re-derive from `decisionCode`, potentially overwriting the existing canonical.

This "drift" case (where `decisionCode` and the `v1` canonical may disagree) is a critical transformation pathway but is not explicitly listed for verification in the acceptance criteria.

**Evidence**: `[UNVERIFIED]` — This is a logical omission within the `spec.md` artifact itself.

## Residual Risks

1.  **Race Conditions Will Leave v1 Data**: The spec correctly identifies that concurrent `summarize` writes will create new `v1` cache entries during the migration. It proposes that a subsequent re-run will "sweep them up." This means that after the initial migration completes, the system will be in a mixed state of `v1` and `v2` entries, potentially violating the post-migration success criteria (`SC-003`, `SC-004`). This complicates the rollout of PR #2, which depends on a clean, `v2-only` state. The operational cost of needing multiple, indeterminate migration runs should be acknowledged.

2.  **Unverified `orientationFlipped` Default**: `FR-009` specifies that for legacy transcripts with a null `scenario_id`, `orientationFlipped` should default to `false`. This is an assumption about the state of legacy data. If this assumption is incorrect, the migration will silently corrupt `favoredValueKey` for any affected transcript where the orientation was actually flipped, by assigning the decision to the wrong value in the pair.

3.  **Migration May Silently Fail on Scale**: `FR-011` states writes are per-row atomic, which is good for avoiding locks. However, for a large dataset, a script that performs millions of individual `UPDATE` statements can be slow and operationally difficult to manage if it fails midway. The spec does not mention any provision for batching, resumability, or performance testing, creating a risk that the migration as-designed is not viable for the production dataset.

## Token Stats

- total_input=16608
- total_output=1045
- total_tokens=19981
- `gemini-2.5-pro`: input=16608, output=1045, total=19981

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
