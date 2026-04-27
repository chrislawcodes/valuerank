---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-token-reliability/spec.md"
artifact_sha256: "871db85a2cebd2e6fc201c533faa8e8cb50db8dbf8a7c56c8d555b9e067dc07f"
repo_root: "."
git_head_sha: "be8143e7c054fe5971f8dc54db54f78cb85f6cb2"
git_base_ref: "origin/main"
git_base_sha: "be8143e7c054fe5971f8dc54db54f78cb85f6cb2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (CI integration load-bearing): RE-AFFIRMED — FR-008a already mandates the new feature-factory-tests CI job; reviewer's repeated concern is the right level of emphasis. MEDIUM (path filter): same — FR-008a covers it. LOW (overlap detection complexity): documented in FR-004 — codex_modified_existing_dirty triggers skip+warn, no auto-commit; operator manually resolves. Instrumentation misinterpretation: FR-011 already documents proxy-not-cache caveat with operator guidance."
raw_output_path: "docs/workflow/feature-runs/ff-token-reliability/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. **CRITICAL: Test Isolation Gate is Ineffective Without CI Integration**

- **Severity**: HIGH
- **Evidence**: `[CODE-CONFIRMED]`

The spec correctly identifies in FR-008a that the Python unit tests for the feature-factory scripts are not currently executed in the CI pipeline defined in `.github/workflows/ci.yml`. The file `ci.yml` shows jobs for linting/building JS/TS (`lint-build`), and running JS/TS tests (`web-tests`, `api-tests`), but contains no steps for discovering or running any Python `unittest` suite under `docs/workflow/operations/codex-skills/feature-factory/scripts/tests`.

Therefore, the proposed test isolation gate (Fix 3), while well-designed, would be completely ineffective as it would never run. Shipping this feature without the corresponding CI change would provide a false sense of security, leaving the project vulnerable to the exact "silent-destruction-of-spec-files" bug it aims to prevent. The success of this crucial safety feature is entirely dependent on adding a new, correctly configured job to `ci.yml`.

### 2. **CI Path Filtering Logic is Insufficient for New Test Suite**

- **Severity**: MEDIUM
- **Evidence**: `[CODE-CONFIRMED]`

FR-008a correctly notes that the `changes` job in `ci.yml` only calculates path-based changes for `api` and `web` outputs. The spec proposes adding a `feature_factory` output to conditionally run the new test suite.

This is a critical dependency for conditionally running the new `feature-factory-tests` job. If this change is implemented incorrectly or omitted, the new CI job will either never run (defeating the purpose of Fix 3) or must be configured to run on every commit (as the spec notes as an alternative), which would increase CI usage for irrelevant changes. The current implementation of the `changes` job is not capable of triggering a `feature-factory-tests` job as-is.

### 3. **Auto-Commit Logic Creates Risk of Committing Overlapping Changes**

- **Severity**: LOW
- **Evidence**: `[UNVERIFIED]`

The spec for the auto-commit feature (Fix 2) shows sophisticated logic in FR-004 to avoid committing an operator's pre-existing, unrelated changes. It correctly isolates "Codex-introduced" changes. However, it introduces a new edge case in the `codex_modified_existing_dirty` check.

The proposed logic is to detect when Codex modifies a file that the operator *also* had pending changes in, and then skip the auto-commit. While this prevents automatic application of a potentially messy merge, it leaves the operator in a state where they have to manually resolve the overlap. This complex state management (`git diff` between object SHAs pre- and post-Codex) is fragile. An error in this logic could fail to detect an overlap, leading to a confusing commit history, or it could abort unnecessarily. The spec correctly identifies the risk of committing unrelated files, but the mitigation for overlapping files creates its own operational complexity.

### 4. **Instrumentation Data Prone to Misinterpretation**

- **Severity**: LOW
- **Evidence**: `[UNVERIFIED]`

The instrumentation for token and resource usage (Fix 4) is explicitly designed as a proxy metric (FR-011). The spec is commendably transparent about the limitations (it's not cache-aware, doesn't track all reads, etc.). However, there is a risk that the consumer of this data (the AI orchestrator or a human operator) will eventually treat these proxy numbers as absolute truth, especially as the context of their limitations is lost over time. This could lead to flawed optimization decisions based on inaccurate data. While the spec suggests documenting this in help text, the risk of misinterpretation for any numerical telemetry is persistent.

## Residual Risks

- **R1 (low)**: The auto-reseal logic in `FR-001` relies on a path-check to ensure only review-related files were modified. If the `reconcile` command's behavior ever expands to legitimately modify code files, this path-check will become a bug, preventing necessary reseals. The safety net is brittle to future changes in other commands.

- **R2 (low)**: The `review-extract` command (Fix 5) relies on a set of regular expressions (FR-016) to find findings. While this is more robust than an LLM call, it's still vulnerable to changes in review formatting. A new reviewer or a change in reviewer prompting could introduce a novel format for severity tags that the regexes would miss, causing findings to be silently ignored by the orchestrator.

## Token Stats

- total_input=10242
- total_output=1024
- total_tokens=27908
- `gemini-2.5-pro`: input=10242, output=1024, total=27908

## Resolution
- status: accepted
- note: HIGH (CI integration load-bearing): RE-AFFIRMED — FR-008a already mandates the new feature-factory-tests CI job; reviewer's repeated concern is the right level of emphasis. MEDIUM (path filter): same — FR-008a covers it. LOW (overlap detection complexity): documented in FR-004 — codex_modified_existing_dirty triggers skip+warn, no auto-commit; operator manually resolves. Instrumentation misinterpretation: FR-011 already documents proxy-not-cache caveat with operator guidance.
