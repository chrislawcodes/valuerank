---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/plan.md"
artifact_sha256: "2a0a7d1ffcee556c484b38b7e56b9aa8754c0cf4604364a5b969615910ba4043"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility."
raw_output_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
|---|---|
| **HIGH** | **Plan Staleness Hash is Brittle:** The `compute_narrowed_artifact_sha` implementation falls back to a full-file hash if the `## Review Reconciliation` heading is missing, duplicated, or fenced. This logic is brittle and misses common failure modes. A simple typo (`Reconcilation`), casing change (`reconciliation`), or extra word (`## Final Review Reconciliation`) would not be caught by the described checks, causing an incorrect full-file hash to be used. This would lead to false positive staleness reports where only non-semantic metadata has changed. The verification plan only covers spacing, missing, duplicate, and fenced headings, omitting these near-miss cases. |
| **MEDIUM** | **Severity Preprocessing Logic is Ambiguous:** The plan states that fenced code blocks, blockquotes, and other elements will be stripped before regex matching to avoid false positives. However, it does not specify the order of operations or how nested elements are handled. A finding marker could be hidden inside a blockquote that is itself inside a table cell. If tables are preserved while blockquotes are stripped, the outcome is uncertain. The verification plan calls for testing table cells and blockquotes separately but does not mention testing for nested or complex structures, which could still allow a finding to be missed. |
| **MEDIUM** `[UNVERIFIED]` | **Re-opening Reviews May Have Untested Side Effects:** The plan correctly identifies the need to test that `UPDATE_REVIEW` supports transitioning an `accepted` review back to `open`. However, it assumes this transition is an isolated state change. Given no code access, it's a significant unverified assumption that this state change doesn't trigger other workflows (e.g., notifications, audit logs, metric counters) that might not expect this transition, potentially leading to inconsistent system state or confusing operator logs. The verification only covers the state change itself. |
| **LOW** | **Whitespace Normalization May Mask Differences:** The `_canonical_note` function collapses all `\s+` to a single ASCII space. This is a reasonable normalization, but it's an assumption that no meaningful distinction is ever conveyed by multiple spaces or different types of whitespace (e.g., non-breaking space). This could, in a rare edge case, cause two semantically different notes to be evaluated as identical. The verification plan does not explicitly call for a test to confirm this collapsing behavior correctly handles mixed or multiple whitespace characters. |
| **LOW** `[UNVERIFIED]` | **Repair Flag Reuse Does Not Verify Malicious State:** The plan for repair-flag reuse focuses on ignoring malformed saved entries (`schema_version` mismatch, etc.). It does not specify how to handle a correctly-formed entry that contains unsafe values. For example, if a developer manually edits the state file to inject a non-scalar or non-whitelisted flag into the `last_successful_checkpoint_flags` dictionary. The test plan verifies that excluded flags like `use_existing_artifact` are not *persisted*, but it should also verify that if such a flag *is present* in the state file, it is safely ignored and not used during the repair. |

## Residual Risks

| ID | Risk | Mitigation / Testability Concern |
|---|---|---|
| **R1** | **Plan Freshness Depends on Heading Integrity:** As noted in the HIGH severity finding, the plan-staleness check is brittle. The current plan accepts this brittleness, with `R7` stating that casing changes or renames will fall back to a full hash. This is a weak mitigation. The system should be more resilient. **From a testability perspective, the verification suite must be expanded to include multiple examples of typos, casing changes, and other near-misses to confirm the fallback to the full-file hash is reliable and predictable, even if the desired narrowing fails.** |
| **R2** | **Reconciliation Verification is Environment-Dependent:** The plan correctly identifies in `R3` that PyYAML availability may differ between environments and specifies a test for the fallback path. However, a residual risk remains: the fallback parser is described as "intentionally less canonical." This implies it may have different bugs or parsing quirks beyond just string normalization (e.g., handling of special characters, encoding). A single test confirming the fallback is triggered is insufficient. **The test suite for the fallback parser should be nearly as comprehensive as for the primary parser, covering as many edge cases (escaped chars, encodings, etc.) as is feasible to prevent environment-specific bugs.** |
| **R3** | **Severity Keyword Matching Is Not Future-Proof:** The plan correctly notes in `R6` that `P0`/`SEV` aliases are out of scope. The risk is that ordinary prose (e.g., `this is a high-priority task`) could be misinterpreted as a finding. The verification plan includes negative tests for `high availability` and `low risk`. **This test set is too small. It should be expanded into a larger corpus of "negative" documents containing common business and technical phrases that use severity keywords in non-finding contexts to ensure the regex grammar is robustly specific.** |

## Token Stats

- total_input=12230
- total_output=1096
- total_tokens=15220
- `gemini-2.5-pro`: input=12230, output=1096, total=15220

## Resolution
- status: accepted
- note: Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility.
