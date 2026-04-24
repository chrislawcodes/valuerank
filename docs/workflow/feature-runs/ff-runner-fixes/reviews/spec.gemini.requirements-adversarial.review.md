---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "a82f14b19712743bcdce071c4b6ca8eab51000fe4a7304d2fc203dfb82676f6f"
repo_root: "."
git_head_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round-2 MEDIUM findings: #1 (self-attestation trust) — accepted as known limitation since concern-lifecycle CLI is deferred; truth verification stays out of scope. #2 (post-judge code injection) — accepted; manifest reseal annotation preserves old/new SHA for audit; a strict-mode 'require re-review on drift' is follow-up. #3 (inconsistent stderr/stdout) — ADDRESSED: FR-009 revised to always-stderr. #4 (concern ID brittleness) — accepted limitation, tracked as Risk R5."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Trusting AI Self-Attestation for Addressed Concerns

**Severity**: HIGH
**Description**: The proposed workflow for managing `unresolved_concerns` relies on the orchestrating AI to be truthful without verification. Functional Requirement FR-004 introduces `checkpoint --address <concern-id> --evidence <text>`, but the corresponding edge case analysis states, "Truth verification is out of scope for this feature." This allows an orchestrator to mark a critical finding as addressed with a false or meaningless evidence string (e.g., "fixed" or "done"), which would be accepted by the system. This completely bypasses the new verification mechanism and undermines the integrity of the judge-and-repair loop.
**Evidence**: `[UNVERIFIED]` — This is a logical flaw in the specification itself. The required code for verification does not exist yet, and the plan is to omit it. Without code to check, this finding is based on the spec's explicit non-goal.

### 2. Post-Judge Code Injection without Review

**Severity**: MEDIUM
**Description**: The process for handling artifact drift after a judge's `advance` vote (FR-002) creates an un-audited loophole. When the manifest is resealed, the `reason` for the change defaults to `"post-judge-edits-only"`. This allows arbitrary, un-reviewed code changes to be committed alongside the judge-approved version. The spec's mitigation (Risk R2) is that a human *can* manually diff the SHAs later, but this is a weak procedural control. An orchestrator could introduce defects or unwanted changes that are not subject to the same review as the original artifact.
**Evidence**: `[UNVERIFIED]` — This is a procedural weakness defined in the spec. The relevant code does not exist.

### 3. Inconsistent Warning Stream for Automated Tooling

**Severity**: MEDIUM
**Description**: Functional Requirement FR-009 specifies that the new invariant self-check will emit warnings to `stderr` when `--json` is active but to `stdout` otherwise. This inconsistency is a risk for both automated and human operators. A system parsing JSON from `stdout` might completely miss a critical state contradiction warning sent to `stderr`. This complicates parsing and makes it more likely that important signals will be missed. A consistent policy (e.g., warnings are always sent to `stderr`) is more robust.
**Evidence**: `[UNVERIFIED]` — This finding is based on the behavior described in the spec.

### 4. Brittle Concern ID Generation Risks Dropping Findings

**Severity**: LOW
**Description**: The mechanism for generating a stable `id` for unresolved concerns (FR-003) is based on a hash of the first 48 characters of the reasoning. As noted in Risk R5, this is not stable if a judge significantly rephrases a concern for clarity between review rounds. This could cause a single, persistent issue to be tracked with two different IDs, allowing the original to be dropped without being addressed. While the spec accepts this limitation, it represents a known fragility in a core part of the new workflow.
**Evidence**: `[UNVERIFIED]` — This is a design weakness described in the spec.

## Residual Risks

- **Procedural Over-reliance**: Multiple mitigations for identified risks rely on procedural adherence by the orchestrator or a human operator (e.g., manually diffing SHAs for drift, expecting PR reviewers to notice misuse of the `dismiss` command). The system's safety increasingly depends on agents following rules rather than on technical enforcement, which is inherently less reliable.

- **Unverified Code Context**: The specification refers to numerous scripts and file paths (e.g., `factory_next_action.py`, `factory_review_specs.py`) that are not present in the provided file listing. This review is therefore based solely on the internal logic and consistency of the spec document itself. All findings are tagged `[UNVERIFIED]` because their relationship to the actual codebase cannot be confirmed or denied.

## Token Stats

- total_input=20834
- total_output=861
- total_tokens=24629
- `gemini-2.5-pro`: input=20834, output=861, total=24629

## Resolution
- status: accepted
- note: Round-2 MEDIUM findings: #1 (self-attestation trust) — accepted as known limitation since concern-lifecycle CLI is deferred; truth verification stays out of scope. #2 (post-judge code injection) — accepted; manifest reseal annotation preserves old/new SHA for audit; a strict-mode 'require re-review on drift' is follow-up. #3 (inconsistent stderr/stdout) — ADDRESSED: FR-009 revised to always-stderr. #4 (concern ID brittleness) — accepted limitation, tracked as Risk R5.
