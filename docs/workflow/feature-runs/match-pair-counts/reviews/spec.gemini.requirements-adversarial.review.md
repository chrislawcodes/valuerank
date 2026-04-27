---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/spec.md"
artifact_sha256: "38b307e1ae5d46dd4fb80e4132c6217ba4406674de3ef8fdda60121da97a4b2d"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Judge round 2 advance. Fixes: Verified Facts vs source-code ambiguity addressed (3 separate 'Verified facts' entries explicitly cite stale-branch HEAD vs main); single-direction pairing lifecycle resolved (Spec-level decision 6 — companionRunId stays unset, pairing is statistical); pre-fill defined (Spec-level decision 7)."
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| :--- | :--- | :--- |
| **HIGH** | Spec's "Verified Facts" section contradicts provided source code, creating ambiguity for implementation. | `[CODE-CONFIRMED]` |
| **MEDIUM** | The proposed single-direction launch introduces a new run variant whose pairing lifecycle is not fully specified. | `[UNVERIFIED]` |
| **MEDIUM** | The existing check for incomplete batches is brittle and can misreport run completeness. | `[CODE-CONFIRMED]` |
| **LOW** | The specification defers a key UI decision about pre-filling the launch form, potentially undermining the feature's goal of reducing user error. | `[UNVERIFIED]` |

---

### **Finding 1: Spec's "Verified Facts" section contradicts provided source code, creating ambiguity for implementation.**

**Severity:** HIGH
**Evidence:** `[CODE-CONFIRMED]`

The spec's "Verified facts" section asserts that logic for determining run completeness using `expectedCount` arithmetic (`scenarioSelections × modelCount × samplesPerScenario`) is "DEAD CODE" in the `main` branch, having been replaced by a more robust slot-by-slot check.

However, the provided `cloud/apps/api/src/graphql/queries/domain-coverage.ts` context file explicitly uses this exact arithmetic (lines 205-210) to calculate `incompleteBatchCount`. While the spec instructs reviewers to ignore this as stale code, its presence in the provided context creates a direct contradiction. An engineer implementing this feature will be faced with conflicting sources of truth: trust the spec's assertion about `main`'s state, or trust the provided code context. This ambiguity forces unnecessary verification work to discover the true state of the codebase and increases the risk of building upon an incorrect or outdated understanding of the system.

### **Finding 2: The proposed single-direction launch introduces a new run variant whose pairing lifecycle is not fully specified.**

**Severity:** MEDIUM
**Evidence:** `[UNVERIFIED]`

The spec correctly identifies the need for a single-direction launch capability (US-6) and astutely defers the decision on how to handle the `jobChoiceBatchGroupId` to the plan stage (Open question #5). However, this deferral hides a significant architectural risk. The spec recommends giving the top-up run a fresh group ID of its own. If this path is taken, it's unclear how downstream analysis will recognize this new run as the "partner" to an existing batch.

The existing resolver in `domain-coverage.ts` (lines 235-247) uses these group IDs to deduplicate paired batches. A top-up run with a unique ID will be counted as a new, independent batch. While this correctly contributes to the overall directional count, it fails to logically pair it with the batch it's intended to complete. This could lead to incorrect calculations in other analyses that rely on strict batch pairing. The spec does not sufficiently address how to maintain the paired relationship for analysis when a top-up run is introduced with its own identity.

### **Finding 3: The existing check for incomplete batches is brittle and can misreport run completeness.**

**Severity:** MEDIUM
**Evidence:** `[CODE-CONFIRMED]`

The logic to detect incomplete batches in `domain-coverage.ts` (lines 205-210) compares the total number of transcript records to an expected product (`scenarioSelections * modelCount * samplesPerScenario`). This method is flawed because it cannot detect uneven transcript distribution. For example, a run could have the correct *total* number of transcripts, but some `(scenario, model, sample)` slots could have been missed while others were retried, yielding extra transcripts for the same slot. The simple count comparison would incorrectly mark such a run as complete.

This creates a risk that the `incompleteBatchCount` surfaced to the user is understated. The spec itself notes that a warning about incomplete batches should be displayed, but the logic powering this warning is unreliable. The provided `cloud/apps/api/src/scripts/audit-domain-coverage-completeness.ts` file contains a much more robust slot-by-slot verification method (`findMissingTranscriptKeys`). The resolver's reliance on the primitive count comparison is a known flaw that affects the reliability of the data presented to the user.

### **Finding 4: The specification defers a key UI decision about pre-filling the launch form, potentially undermining the feature's goal of reducing user error.**

**Severity:** LOW
**Evidence:** `[UNVERIFIED]`

The spec's "Open design questions" section (item #6) defers the decision on whether to pre-fill the "Match Pair Counts" launch form with values calculated to precisely close the detected trial gap. A primary goal of the feature is to allow an operator to easily correct an imbalance. By not requiring the form to be pre-filled, the feature risks re-introducing the manual effort and potential for human error it is designed to eliminate.

While the proposed live-recompute card (US-4) would provide feedback on the user's manual input, a superior user experience would be to present them with a form that is already pre-configured for the optimal top-up launch. Deferring this decision creates uncertainty about a core aspect of the user workflow and may result in a less effective final implementation.

## Residual Risks

*   **Documentation Debt:** The spec correctly notes in its "Verified facts" that the project constitution (`CLAUDE.md`) contains outdated information about which database tables use soft-deletes. While this feature's implementation can proceed with the correct knowledge, other developers referencing the constitution may be misled, posing a risk to future features that involve data deletion.
*   **Incomplete Batch Remediation:** The spec wisely scopes out a remediation path for incomplete batches. However, by adding UI that explicitly warns about them ("This pair has incomplete batches..."), it increases the visibility of a problem without offering a solution. This may lead to user frustration, as they will be alerted to an issue they cannot fix within the application.

## Token Stats

- total_input=40924
- total_output=1306
- total_tokens=60009
- `gemini-2.5-pro`: input=40924, output=1306, total=60009

## Resolution
- status: accepted
- note: Judge round 2 advance. Fixes: Verified Facts vs source-code ambiguity addressed (3 separate 'Verified facts' entries explicitly cite stale-branch HEAD vs main); single-direction pairing lifecycle resolved (Spec-level decision 6 — companionRunId stays unset, pairing is statistical); pre-fill defined (Spec-level decision 7).
