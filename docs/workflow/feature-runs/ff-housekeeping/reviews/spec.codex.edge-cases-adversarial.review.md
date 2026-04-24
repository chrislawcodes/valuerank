---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-housekeeping/spec.md"
artifact_sha256: "57c1da3e83611194b16f837e9c02efbdaf3b884439b2f0e0e6ee49c0a878c78f"
repo_root: "."
git_head_sha: "abe37af6980410617bc8583fba79f3603ad9b221"
git_base_ref: "origin/main"
git_base_sha: "85a91778b3c3de491fd6b326879d29fa5dc6d0fa"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-housekeeping/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **Medium**: The quota classifier in **FR-005** is too broad and internally inconsistent. It treats `rate limit` plus `429/402` as quota exhaustion, which can turn a transient throttling failure into `deferred` and let the checkpoint advance when it should still fail. The rule also mixes substring matching with HTTP-status checks without defining precedence or where the status comes from, so the deferred-vs-failed boundary is unstable.
- **Medium**: The reconcile story overstates its guarantee. The summary, **US1**, and **SC-001** imply the three artifacts will never drift after a reconcile call, but **FR-002** explicitly says the helper is not transactional and mid-write failures can still leave drift. That contradiction is not just wording; it can lead to impossible acceptance tests and false confidence about recovery.
- **Medium**: The implementation-rule suppression path is under-specified and contradictory. **FR-012** says the warning depends on `codex_dispatches` for the current HEAD, but **FR-015** stores dispatches as a plain list with no `head_sha`, and **US4/SC-004** only talk about “a `codex_dispatches` entry.” A stale dispatch from an older commit could either suppress warnings forever or fail to suppress them when intended.
- **[UNVERIFIED] Medium**: **FR-012** assumes `git merge-base origin/main HEAD` is always available and meaningful. The spec never defines a fallback for detached worktrees, shallow clones, or repos without an `origin/main` ref, so deliver may fail before it can emit the warning or may compare against the wrong base. This depends on runtime/repo setup, so it is not verified from the artifact alone.

## Residual Risks

- Mid-write reconcile drift can still happen by design. The spec accepts that and relies on rerun recovery, so operators still need a clear manual recovery path.
- The quota rule still depends on current error wording. If OpenAI changes the stderr/stdout text, the classifier may stop deferring quota failures until the spec and tests are updated.
- The implementation-rule check is advisory only. A user can still ignore the warning or override it, so the audit trail matters more than enforcement.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 