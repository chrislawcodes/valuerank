---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "64a54910ad67fdd4b54e618d9f96b68b1fd5db4639f89e037aaad581c62481ba"
repo_root: "."
git_head_sha: "7b414cadc42e915c128f35f296d36dca61c9d85b"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "All findings addressed (see spec round-2 notes in plan.md reconciliation section)"
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### MEDIUM: Concern ID generation is brittle and may fail to track paraphrased findings [UNVERIFIED]

The proposed ID derivation for unresolved concerns (FR-003) uses a hash of the first 48 characters of the reasoning. This is a fragile identifier. A judge who rephrases the beginning of a finding, or even just adds a clarifying clause, will cause a new, distinct ID to be generated for what is semantically the same concern. This undermines the entire lifecycle (`addressed`, `deferred`, `dismissed`) by creating duplicate entries for a single issue, potentially allowing unresolved concerns to slip through verification at the next stage's checkpoint (FR-004). The spec acknowledges this (Risk R5) but accepts the limitation, which remains a significant flaw in the core logic of Fix 1.

### MEDIUM: Severity detection relies on a complex, high-maintenance regex strategy [UNVERIFIED]

Fix 2's approach (FR-006) is to add more regex patterns to catch various ways reviewers might write "HIGH severity". This creates an "arms race" where the tool is always trying to catch up to new, arbitrary markdown formatting choices. This method is inherently brittle and adds maintenance complexity. Each new pattern increases the risk of both false positives on prose (Risk R1) and false negatives on future unforeseen formats. The root problem—a lack of a structured format for review findings—is not addressed, leading to a tactical patch rather than a robust, long-term solution.

### MEDIUM: Audit trail for advancing with artifact drift is based on a weak assumption [UNVERIFIED]

When a judge-approved artifact is modified before advancement, the runner reseals the manifest and adds an annotation with `reason: "post-judge-edits-only"` (FR-002). This reason is a hardcoded assumption. The runner has no way to know *why* the artifact's SHA has drifted. The change could be a substantive modification that invalidates the judge's original approval. By logging a benign, speculative reason, the audit trail becomes misleading and unreliable, undermining trust in the workflow's history.

### LOW: State contradiction warnings may be silently ignored by automated agents [UNVERIFIED]

The invariant self-check (Fix 8) is designed to only log a warning and print to stderr, but explicitly *not* abort the command (FR-009). This design correctly prevents the checker from fragility, but it creates a new risk: an automated orchestrator may not be designed to parse stderr for warnings or check the `state.invariant_warnings` array. If the agent only monitors the command's exit code and stdout, it could silently proceed even when the state is known to be contradictory, leading to the same class of wasted work and debugging cycles that Fix 8 is intended to prevent.

### LOW: The concern lifecycle introduces a new path for misuse without adequate controls [UNVERIFIED]

The `unresolved_concerns` lifecycle introduces a `checkpoint --dismiss` flag (FR-004) that allows an orchestrator to bypass addressing a concern. While the spec notes this action will be visible in the final PR body (FR-005a), it provides no active guardrail against misuse. An automated agent could potentially be configured (or learn) to habitually dismiss valid findings to force a feature through the workflow, subverting the entire purpose of the adversarial review and judging stages. Visibility in a PR is a passive check that may not be sufficient for a highly automated workflow.

## Residual Risks

The spec includes a good list of residual risks. The following are additional risks or elaborations on existing ones that warrant specific attention.

1.  **Systemic Fragility from Unstructured Inputs**: The core of Fix 2 is reactive. By continuing to accept free-form markdown for severity ratings, the system remains vulnerable to any deviation from the currently supported regexes. This commits the project to ongoing maintenance, with each new "missed finding" requiring another patch. The true risk is not that one regex might fail (Risk R1), but that the entire approach is fundamentally fragile.

2.  **Orchestrator Logic Drift**: The spec introduces several new state fields (`judge_next_action`, `unresolved_concerns` lifecycle fields, `invariant_warnings`) and CLI flags (`--address`, `--defer`, `--dismiss`). The runner's behavior is now more complex. There is a risk that the orchestrator agents (Claude, Codex) will not correctly or fully implement logic to handle these new states and tools, leading to the new safety mechanisms being ignored. For example, an agent might never use the `--defer` flag and instead get stuck when it cannot address a concern.

3.  **Loss of Granular Audit Trail**: The manifest resealing process (FR-002) when an artifact has drifted effectively collapses all post-judge edits into a single `advance-with-drift` event. As noted in the finding, the default reason is weak. Furthermore, this loses the specific SHA of the originally judged artifact in the primary manifest. While the `old_sha` is in an annotation, it breaks the primary "chain of custody," making it harder to audit exactly what was approved versus what was advanced.

## Token Stats

- total_input=21199
- total_output=1101
- total_tokens=25479
- `gemini-2.5-pro`: input=21199, output=1101, total=25479

## Resolution
- status: accepted
- note: All findings addressed (see spec round-2 notes in plan.md reconciliation section)
