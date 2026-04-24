---
reviewer: "gemini"
lens: "residual-risk-adversarial"
stage: "closeout"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/closeout.md"
artifact_sha256: "b74c7e980831fbe8ad11b5222a67879d6532e0503f4012a436c8a5fa68ff6962"
repo_root: "."
git_head_sha: "72454c9dcf1043ff5f449e1af1aa54fe3a77c44d"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "72454c9dcf1043ff5f449e1af1aa54fe3a77c44d"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/closeout.gemini.residual-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: closeout residual-risk-adversarial

## Findings

### **CRITICAL: Merge Conflict Blocks Delivery**

The artifact reports the PR's merge state as `CONFLICTING`. This directly contradicts the "What shipped" section. The feature is not shippable in its current state. The described process deviation—bypassing standard checkpoints and implementing directly—is the likely cause, as it would fail to detect drift from the target branch. This represents a critical failure in the described workflow, as the final artifact cannot be integrated.

### **HIGH: Inability to Manage Concern Lifecycles**

The `Concern-lifecycle CLI` was deferred, meaning there is no mechanism to transition an `unresolved_concerns` entry to `addressed`, `deferred`, or `dismissed`. According to the artifact, this forces all concerns, even those handled in-code, to appear in the "Unresolved Judge Concerns" list in the PR body. This clutters the main communication channel for reviewers with stale information, increases the cognitive load of reviewing, and undermines the trustworthiness of the "Unresolved" list as a source of truth. Reviewers may start ignoring the list altogether or unnecessarily block PRs based on already-resolved issues.

### **LOW [UNVERIFIED]: Dead Code and Schema Bloat**

The closeout states that new fields (`addressed_at`, `deferred_reason`, etc.) and a "Resolved Concerns" block were added to the codebase to support a concern's lifecycle. However, since the CLI to manage this lifecycle was deferred, this code and the corresponding data schema are currently dead. Merging unused schema and logic adds immediate technical debt, complicates the system for future developers, and provides no value until the follow-up feature is implemented.

## Residual Risks

### **MEDIUM [UNVERIFIED]: False Sense of Security from Narrow Invariant**

The new `factory_invariants.py` module is described as catching a single, specific state contradiction that caused a past bug (`judge_next_action == "advance"` while `recommended_next_action` is a repair). This is a highly specific, reactive fix. The risk is that it creates a false sense of security that state invariants are now broadly protected. An adversarial perspective suggests numerous other potential state contradictions are not being checked. The system remains vulnerable to different classes of invariant violations that will go undetected, as the new check is not comprehensive.

### **LOW: Silent Failure Vector for Automated Tooling**

The artifact notes that invariant warnings are routed to `stderr` during `--json` runs to avoid contaminating the machine-readable `stdout`. It presents `status` as a mitigation. However, automated systems and scripts are often designed to consume `stdout` exclusively and will not check `stderr` or run a separate `status` command. This creates a silent failure vector where critical state contradiction warnings can be missed by the very automation that is supposed to act on them, potentially causing it to proceed with actions based on a flawed state.

## Token Stats

- total_input=1429
- total_output=609
- total_tokens=16591
- `gemini-2.5-pro`: input=1429, output=609, total=16591

## Resolution
- status: open
- note: