---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/spec.md"
artifact_sha256: "70c7715a932eaa6c8e8ac5f56422eaf2b5dd7ea3bdbd67841e9a4d584f670261"
repo_root: "."
git_head_sha: "51207c8bf078e076ea613e85c0b9abf3dd36ea7a"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (contradictory test vs FR-011): FIXED — independent test is now textual, not schema-level. MEDIUM (atomic reseal): FIXED — FR-005 requires pre-check validation of all targets before any write. LOW (clear-before-append order): FIXED — FR-014 requires help text to document explicitly. LOW (lifecycle ordering): FIXED — edge case is now mutually exclusive via argparse, no implicit order."
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Contradictory and Unenforceable Validation for Judge Prompt Hardening
**Severity**: HIGH
**Finding**: The spec contains a direct contradiction regarding the enforcement mechanism for the restatement judge (Fix 3). `FR-011` explicitly states there will be **"No schema change — the enforcement is prompt-level."** However, the "Independent test" for US3 requires the exact opposite: **"Assert the judge schema validation fails the verdict"**. This is impossible without a schema change. Relying on prompt-level enforcement for a rule designed to prevent adversarial gaming is fundamentally flawed, as LLM-based judges can fail to adhere to nuanced instructions. A change in the judge's reasoning format would not be caught, undermining the entire fix.
**Evidence**: `[UNVERIFIED]`
**Recommendation**: The contradiction must be resolved. The "Independent test" plan is the correct approach. The fix should include a schema change to enforce the presence of a quoted prior finding when the "diminishing returns" rule is invoked. For example, adding a `quoted_prior_finding: Optional[str]` field to the judge's output schema and validating it.

### 2. Inconsistent State Risk from Partial Manifest Resealing
**Severity**: MEDIUM
**Finding**: The `--validation-only` workflow (Fix 2, FR-005) requires updating the checkpoint manifest (`.checkpoint.json`) and *each* referenced review file (`.review.md`). The spec does not define the behavior if one of these file writes fails (e.g., due to file corruption, permissions issues, or intermittent disk errors). A partial write could leave the system in an inconsistent state, where some review files have the new SHA while the manifest and other review files have the old one. This would corrupt the audit trail and potentially break subsequent tool invocations that rely on manifest-file consistency.
**Evidence**: `[UNVERIFIED]`
**Recommendation**: The reseal operation must be atomic or, failing that, transactional with a rollback mechanism. At minimum, the tool should validate that all target files were written successfully and report a clear error if a consistent state cannot be achieved, rather than exiting 0 after a partial success.

### 3. CLI Argument Append/Clear Behavior May Violate Principle of Least Astonishment
**Severity**: LOW
**Finding**: For the `discover` command (Fix 4, FR-014), the spec dictates that `--clear-non-goals` runs *before* `--non-goal D` in the same invocation. While this is a common argparse pattern, it can be unintuitive. A user might reasonably expect flags to be processed in the order they appear, which would result in the list being cleared *after* "D" was added, producing an empty list. This could lead to operators accidentally clearing data they intended to keep.
**Evidence**: `[UNVERIFIED]`
**Recommendation**: Explicitly document this "clear-then-append" order in the command's help text. For greater safety, consider making `--clear-*` flags mutually exclusive with their corresponding append flags in the same invocation to force a two-step, unambiguous operation.

### 4. Undefined Behavior for Out-of-Order Lifecycle Flags
**Severity**: LOW
**Finding**: The edge cases for `--validation-only` mention that if combined with concern-lifecycle flags (`--address`, etc.), the lifecycle path runs first and `--validation-only` becomes a no-op. This implies a specific, hardcoded order of operations within the `command_checkpoint` function. This dependency is fragile and undocumented in the user-facing spec. An unrelated code change could alter this internal execution order, leading to unexpected behavior where a manifest is resealed *before* a concern is properly addressed, potentially masking the concern.
**Evidence**: `[UNVERIFIED]`
**Recommendation**: The interaction should be explicitly defined and enforced, not left to implicit internal ordering. Either make the flag combinations mutually exclusive via `argparse` or guarantee the order of operations with a dedicated test case.

## Residual Risks

### Risk R1 — New Character Budgets May Be Suboptimal
The spec raises default character budgets to values "observed" in recent runs. This is reasonable, but it formalizes a new baseline without data on its broader impact.
- **Hidden Flaw**: While preventing "partial-coverage" warnings, the larger context windows may lead to consistently higher LLM processing costs and push the system closer to provider rate limits (as noted in `docs/provider-rate-limits.md`), especially if multiple runs are triggered in parallel.
- **Recommendation**: The orchestrator should monitor cost and performance metrics after this change is deployed. If the new defaults prove too aggressive, they can be tuned down. The risk is manageable as operators can still override the defaults.

### Risk R2 — Prompt-Level Enforcement Remains a Weak Point
Even with the recommended schema change from Finding #1, other parts of the judge prompts rely on pure instruction-following.
- **Weak Assumption**: The spec assumes that judges will correctly follow complex rules like "true saturation" (FR-010) or "first-round-proceed" (FR-009). These rules, enforced only by text, are susceptible to misinterpretation by future, more advanced, or simply different LLM versions used for the judge panel, leading to incorrect verdicts.
- **Recommendation**: This is an inherent risk in the system's design. The long-term mitigation is to progressively convert all logical rules in judge prompts into structured, verifiable fields in the output schema. This feature does not increase that risk but also does not reduce it for rules outside its immediate scope.

## Token Stats

- total_input=19462
- total_output=1199
- total_tokens=22610
- `gemini-2.5-pro`: input=19462, output=1199, total=22610

## Resolution
- status: accepted
- note: HIGH (contradictory test vs FR-011): FIXED — independent test is now textual, not schema-level. MEDIUM (atomic reseal): FIXED — FR-005 requires pre-check validation of all targets before any write. LOW (clear-before-append order): FIXED — FR-014 requires help text to document explicitly. LOW (lifecycle ordering): FIXED — edge case is now mutually exclusive via argparse, no implicit order.
