---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-judge-panel/spec.md"
artifact_sha256: "9b2bd20db0395f419ae1f906625fe81002a5d69c25bfa4b65309a02294cf4c75"
repo_root: "."
git_head_sha: "bfaba32f7d10406e0658c81541974dd4589c9bda"
git_base_ref: "origin/main"
git_base_sha: "bfaba32f7d10406e0658c81541974dd4589c9bda"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round-4 HIGH repair-underspecified addressed by new FR-006a (full repair command definition). MEDIUM judge-inputs-overlap: accepted tradeoff; Completeness and Impl-risk both need the artifact chain but consume it differently (findings context vs diff context); Restatement judge has fully distinct input. MEDIUM back-test-without-gh-cant-see-CI: acknowledged; documented as limitation in back-test.md runbook (FR-026). LOW SKILL.md-refresh-implicit addressed by FR-024 (SKILL.md updates mandated)."
raw_output_path: "docs/workflow/feature-runs/ff-judge-panel/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| HIGH | Underspecified `repair` command for recovering from state corruption creates an unmitigated operational risk. | [UNVERIFIED] |
| MEDIUM | Judge input views lack sufficient distinction, undermining the goal of independent assessment and increasing the risk of correlated failures. | [UNVERIFIED] |
| MEDIUM | The back-test script's fallback for environments without GitHub API access is insufficient, losing the critical signal from CI results. | [UNVERIFIED] |
| LOW | The responsibility for triggering a PR body refresh is implicit, creating a potential integration gap between the runner and the orchestrator skill. | [CODE-CONFIRMED] |

### HIGH: Underspecified `repair` command for recovering from state corruption creates an unmitigated operational risk.

Functional Requirement `FR-006` astutely identifies a race condition where a crash could leave the `state.json` file in an inconsistent state (`adversarial_rounds` incremented, but no review was actually completed). The specified mitigation is "a manual `repair` command handles this — documented in runbook."

However, the spec provides no details on this critical `repair` command. Its function, arguments, safety checks, and idempotency are undefined. By deferring the definition of a tool meant to fix data corruption, the spec introduces a significant operational risk. If the failure mode occurs, the operator will be left with a blocked workflow and no documented or implemented way to fix it, potentially forcing a manual and error-prone edit of the state file.

### MEDIUM: Judge input views lack sufficient distinction, undermining the goal of independent assessment and increasing the risk of correlated failures.

Goal #3 of the spec is to use "Three independent judges with distinct lenses and distinct input views" to minimize groupthink, referencing research on the dangers of sycophancy and correlation.

However, `FR-010` specifies inputs that violate this principle. The "Completeness" judge and the "Implementation-risk" judge both receive the `full artifact chain` as their primary input. While their supplemental data differs (findings vs. diff), the massive overlap in their core input data subverts the goal of having distinct views. This design increases the likelihood that both judges will be influenced by the same flaw in the core artifact, leading to correlated wrong answers and reducing the panel's effectiveness as a safety mechanism.

### MEDIUM: The back-test script's fallback for environments without GitHub API access is insufficient, losing the critical signal from CI results.

The spec defines a back-test script (`FR-021`) to provide a crucial feedback loop on judge effectiveness. It correctly identifies a scenario where the script may not have GitHub API access. The specified fallback is to "use local `git log` for revert pattern matching; flag incident correlation as 'unavailable'".

This fallback is insufficient because it completely omits the "CI run results" signal. A primary failure mode for a feature is that it passes all reviews but breaks the build or tests. In an environment where the back-test script cannot query the GitHub API, it would be blind to such failures. The script would erroneously report a clean outcome for features that consistently broke CI, rendering the back-test less reliable.

### LOW: The responsibility for triggering a PR body refresh is implicit, creating a potential integration gap between the runner and the orchestrator skill.

`FR-020c` introduces a `deliver --refresh` command to solve the problem of a PR description becoming stale as new judge concerns are recorded in later stages. This is a robust mechanism.

The flaw is that the spec does not explicitly state that the orchestrator skill (`SKILL.md`) must be updated to call this command. The current `SKILL.md` does not include any logic for refreshing an existing PR. If the orchestrator follows its current instructions, it will create the PR once and never update it, causing new annotations and unresolved concerns to become invisible to the human reviewer. The spec for the runner is sound, but it fails to specify the required corresponding change in its primary client, the orchestration skill.

## Residual Risks

Even if all findings above are addressed, the following risks are inherent in the specified design and should be acknowledged.

1.  **Risk of Forcing Unsafe Artifacts Forward:** The core design intentionally caps iteration rounds to prevent loops. A direct consequence is that a stage with a critical, persistent flaw (e.g., a security vulnerability) that judges correctly block for all three rounds *will be automatically advanced*. This design transfers the final safety responsibility from the automated multi-agent system to the human PR reviewer, who must diligently inspect and understand the surfaced "unresolved concerns".
2.  **Risk of Correlated Judge Failure (Monoculture):** The spec correctly identifies the monoculture risk of using a 2-Codex, 1-Claude panel, noting a potential ~0.7 correlation on wrong answers within the same model family. This creates a non-trivial risk that a flaw missed by one Codex judge will also be missed by the other, leading to an incorrect majority `proceed` vote.
3.  **Operational Overhead of Transitional Mechanisms:** The design includes several temporary mechanisms to ensure backward compatibility, such as dual-writing state (`FR-005a`) and creating review files in two formats (`FR-012a`). While necessary for a smooth rollout, this adds complexity and technical debt that must be deliberately paid down in the future.
4.  **Adherence to Code Quality Standards:** The spec notes that Python implementation files should adhere to the 400-line limit from `cloud/CLAUDE.md`. As this is a convention rather than a mechanically enforced rule for Python files, there is a risk that the implementation could produce large, complex modules that are difficult to maintain, undermining a core project principle.

## Token Stats

- total_input=29267
- total_output=1236
- total_tokens=34182
- `gemini-2.5-pro`: input=29267, output=1236, total=34182

## Resolution
- status: accepted
- note: Round-4 HIGH repair-underspecified addressed by new FR-006a (full repair command definition). MEDIUM judge-inputs-overlap: accepted tradeoff; Completeness and Impl-risk both need the artifact chain but consume it differently (findings context vs diff context); Restatement judge has fully distinct input. MEDIUM back-test-without-gh-cant-see-CI: acknowledged; documented as limitation in back-test.md runbook (FR-026). LOW SKILL.md-refresh-implicit addressed by FR-024 (SKILL.md updates mandated).