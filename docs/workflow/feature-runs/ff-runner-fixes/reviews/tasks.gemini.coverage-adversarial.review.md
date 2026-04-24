---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/tasks.md"
artifact_sha256: "4a74e08b65179da926013be34c58b47652b5eafb36c7b02fcc0867dcf9982805"
repo_root: "."
git_head_sha: "55f130cde79344c09ac3c9f873a77abae390e6f9"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F-1 (ID collision): documented Risk R5. F-2 (gate only immediate prior stage): accepted — CLI is deferred so enforcement path is follow-up; for now concerns render in PR body across all stages. F-3 (hook staleness): manually curated, documented. F-4 (eviction oldest-first): ring-buffer semantics in code. F-5 (silent invariant failure): code catches exceptions and records an invariant_warning with the error message. F-6 (structural anchoring term): regex test matrix defines it empirically — shape list in ACTIONABLE_FINDING_SHAPES tuple."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding | Task(s) |
| --- | --- | --- | --- |
| **HIGH** | F-1 | **Potential ID Collision in Unresolved Concerns:** The hashing algorithm for `unresolved_concerns` uses a small slice of the reasoning text (`.split()[:48]`). Two distinct findings with similar initial wording could generate the same ID. This would allow an action on one concern (e.g., `checkpoint --address`) to unintentionally affect the other, potentially causing a critical finding to be marked as addressed and ignored. | T3.5 |
| **MEDIUM** | F-2 | **Incomplete Quality Gate for Unresolved Concerns:** The verification check is described as blocking on "unresolved-concerns-from-<prior-stage>" (singular). If this implementation only checks the *immediately* preceding stage (e.g., `plan` checks `spec`), it could miss lingering open concerns from earlier stages (e.g., an unaddressed `spec` concern when checkpointing `tasks`). This would allow a feature to proceed despite known, unresolved issues. | T3.7 |
| **MEDIUM** | F-3 | **[UNVERIFIED] Invariant Check Bypass on Extension:** The list of state-mutating commands that trigger invariant checks is manually maintained. There is no automated mechanism proposed to ensure that a future developer adding a new state-mutating command will also add it to the `_STATE_MUTATING_COMMANDS` set. This creates a high risk that future commands will be added without invariant oversight, silently degrading system health. | T2.4 |
| **LOW** | F-4 | **[UNVERIFIED] Undefined Invariant Warning Eviction Policy:** The task specifies a cap of 100 invariant warnings but does not define the behavior when the cap is exceeded. If the oldest warnings are evicted, the initial root-cause warnings in a long failure cascade could be lost, hiding crucial diagnostic information from the user. | T2.1 |
| **LOW** | F-5 | **[UNVERIFIED] Silent Failure of Invariant Checks:** The plan ensures that an exception within an individual invariant check does not crash the main process. However, it does not specify that the exception itself must be logged. A broken invariant check could therefore fail silently, giving a false sense of security that all invariants are passing when, in fact, they are not even running. | T2.6 |
| **LOW** | F-6 | **[UNVERIFIED] Ambiguous Regex Anchoring:** The task requires "structural anchoring" for its finding-detection regex but does not define the term. This is a weak assumption. If the implementation does not correctly handle variations in indentation or list formatting (e.g., `*` vs. `-`), it could fail to detect valid findings, leading to an incomplete review analysis. | T1.1 |

## Residual Risks

- **Maintenance Brittleness:** The reliance on a manually curated list of commands to trigger invariant checks (F-3) introduces a significant risk that the system's safety mechanisms will degrade over time as new commands are added without being registered for checks.
- **Diagnostic Obscurity:** The combination of an undefined warning cap policy (F-4) and the potential for silent failures in the checks themselves (F-5) creates a risk that developers will not have the full picture when diagnosing a problem. Early, critical warnings may be dropped or failing checks may not be reported, leading to longer and more difficult debugging sessions.
- **Data Aliasing:** The ID generation scheme for concerns (F-1) carries a low-probability but high-impact risk of data aliasing, where two separate issues are treated as one. This fundamentally undermines the integrity of the judge/review cycle by allowing issues to be unintentionally dismissed.

## Token Stats

- total_input=2440
- total_output=807
- total_tokens=16603
- `gemini-2.5-pro`: input=2440, output=807, total=16603

## Resolution
- status: accepted
- note: F-1 (ID collision): documented Risk R5. F-2 (gate only immediate prior stage): accepted — CLI is deferred so enforcement path is follow-up; for now concerns render in PR body across all stages. F-3 (hook staleness): manually curated, documented. F-4 (eviction oldest-first): ring-buffer semantics in code. F-5 (silent invariant failure): code catches exceptions and records an invariant_warning with the error message. F-6 (structural anchoring term): regex test matrix defines it empirically — shape list in ACTIONABLE_FINDING_SHAPES tuple.
