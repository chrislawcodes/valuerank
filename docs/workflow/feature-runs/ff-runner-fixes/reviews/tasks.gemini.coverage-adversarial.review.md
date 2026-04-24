---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/tasks.md"
artifact_sha256: "2bcb85d7575f8c1c9a11aa344f662c30280feeba496b385cda84783f9c14d2c9"
repo_root: "."
git_head_sha: "b8d5934f8215b9d6e4bffd546f5abca8e9799c79"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F-1 (invariant hook staleness): accepted as known limitation; future commands register via _STATE_MUTATING_COMMANDS literal. F-2 (CLI validation tests): CLI flags deferred from this PR to follow-up. F-3 (ID brittleness): Risk R5. F-4 (blocked state UX): concerns render in PR body (FR-005a) + status surfaces invariant_warnings; CLI surfaces concern ids in blocked-message — deferred with CLI. F-5 (adversarial regex inputs): added CRLF + leading-tab tests. F-6 (fixture authenticity): real run-033 state.json is used, not synthesized. F-7 (cap behavior): code discards oldest entries when exceeding 100, matching common ring-buffer behavior."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding |
| :--- | :--- | :--- |
| **HIGH** | F-1 | **Invariant checks can be silently bypassed.** Task T2.4 specifies that the list of commands triggering invariant checks is a manually maintained `frozenset`. There is no automated task to ensure this set remains synchronized with the actual list of state-mutating commands. A developer adding a new command could easily fail to update this set, silently disabling this entire safety feature for the new command. |
| **HIGH** | F-2 | **New CLI commands lack validation.** Task T3.6 introduces `checkpoint --address`, `--defer`, and `--dismiss` flags. The associated test plan in Slice 3 (T3.9-T3.11) does not include any tests for input validation, such as providing non-existent IDs, empty reason strings, or malformed arguments. This could lead to unhandled exceptions or state corruption. |
| **MEDIUM** | F-3 | **[UNVERIFIED] Concern tracking is brittle.** The ID generation for `unresolved_concerns` in T3.5 is based on a hash of the reasoning text. While it uses normalization, it is still vulnerable to minor rephrasing of the same underlying issue, which would generate a new ID and be treated as a distinct concern. This could allow duplicate open concerns to bypass the resolution gate in T3.7. |
| **MEDIUM** | F-4 | **[UNVERIFIED] Blocked state may have poor user experience.** Task T3.7 introduces a hard block if a prior stage has open `unresolved_concerns`. However, the tasks do not specify how a user is clearly informed of which specific concerns are blocking them. Task T2.5 only surfaces `invariant_warnings` in the status summary, not unresolved concerns. This could force users to manually inspect the JSON state file to diagnose the block. |
| **MEDIUM** | F-5 | **Regex test cases are insufficient.** The test plan in T1.2 for the new finding-detection regex covers positive and negative cases, but does not mention testing for adversarial or non-standard inputs. It should explicitly include tests for unusual whitespace, mixed newline characters (`\n` vs `\r\n`), and other markdown variations to prevent trivial evasions. |
| **LOW** | F-6 | **Test fixture may not be authentic.** Task T0.2 allows for synthesizing a fixture for the regression test. A synthesized fixture may not capture the exact, subtle conditions of the original bug, potentially resulting in a regression test that passes but doesn't actually prevent the bug from recurring. |
| **LOW** | F-7 | **Invariant warning cap behavior is undefined.** Task T2.1 specifies a cap of 100 for `invariant_warnings`, but does not define the behavior when the cap is exceeded. It is unclear if the oldest or newest warnings will be discarded, which could impact the ability to debug cascading failures. |

## Residual Risks

- **Invariant Bypasses:** Even after this implementation, the primary risk is that the invariant-checking system will become stale. A new state-mutating command could be added without being registered for checks, leading to a false sense of security. The integrity of the system relies on continuous manual developer discipline rather than an automated safeguard.
- **Incomplete Concern Tracking:** The system will remain susceptible to duplicate, untracked `unresolved_concerns` if a judge slightly rephrases an existing finding instead of using the formal lifecycle commands. This could allow unresolved issues to slip past the `checkpoint` gate.
- **Partial Reliability:** The tasks note that several related fixes (3, 4, 5, 6, 7) are being deferred (T4.1). Users may perceive the Feature Factory runner as fully fixed and place undue trust in its recommendations, when in fact significant failure modes may still exist. The system's reliability will be improved but not guaranteed.

## Token Stats

- total_input=13963
- total_output=846
- total_tokens=17163
- `gemini-2.5-pro`: input=13963, output=846, total=17163

## Resolution
- status: accepted
- note: F-1 (invariant hook staleness): accepted as known limitation; future commands register via _STATE_MUTATING_COMMANDS literal. F-2 (CLI validation tests): CLI flags deferred from this PR to follow-up. F-3 (ID brittleness): Risk R5. F-4 (blocked state UX): concerns render in PR body (FR-005a) + status surfaces invariant_warnings; CLI surfaces concern ids in blocked-message — deferred with CLI. F-5 (adversarial regex inputs): added CRLF + leading-tab tests. F-6 (fixture authenticity): real run-033 state.json is used, not synthesized. F-7 (cap behavior): code discards oldest entries when exceeding 100, matching common ring-buffer behavior.
