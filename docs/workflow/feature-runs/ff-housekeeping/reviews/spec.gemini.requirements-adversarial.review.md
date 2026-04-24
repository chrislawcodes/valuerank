---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-housekeeping/spec.md"
artifact_sha256: "769546a0c1b7e0faa9f32465e35cc2722aae6884984f9f7254f229224a4b2acb"
repo_root: "."
git_head_sha: "abe37af6980410617bc8583fba79f3603ad9b221"
git_base_ref: "origin/main"
git_base_sha: "85a91778b3c3de491fd6b326879d29fa5dc6d0fa"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed during spec/plan/tasks rounds (see plan.md reconciliation rollup)."
raw_output_path: "docs/workflow/feature-runs/ff-housekeeping/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### CRITICAL

- **F-01: False promise of atomicity in reconcile helper.** The spec correctly identifies that the three-way reconcile is not a true transaction (FR-002), but this point is buried. The summary and user story (US1) promise an "atomic" helper that eliminates drift. In reality, a mid-operation failure (e.g., disk full after writing the first file) can still cause the exact drift the feature is meant to solve. The recovery path is "idempotent re-run," but this is not guaranteed to be safe if the first run left a file in a partially written or corrupted state. The spec should be re-framed to emphasize "consistency" and "idempotent repair" rather than "atomicity." The primary value is reducing manual effort for the common case, not providing transactional guarantees.

### HIGH

- **F-02: Implementation rule line counting is easily gamed and incomplete.** FR-012/FR-016's reliance on `git diff --numstat` is brittle. A developer could refactor code by moving it between files, which `numstat` would count as massive additions and deletions, potentially triggering the warning incorrectly. Conversely, a developer could make a large number of small, single-line changes across many files that stay under the 200-line threshold but represent a significant implementation. The rule should consider the number of changed files or use a more sophisticated metric if the goal is to capture significant "manual" work. Furthermore, specifying only `*.py`, `*.ts`, `*.tsx`, `*.js`, `*.jsx` is too narrow and misses other common code files like `*.css`, `*.html`, `*.sql`, etc., which could easily contain hundreds of lines of implementation logic.

- **F-03: `[UNVERIFIED]` Brittle dependency on subprocess output for quota detection.** FR-005's proposal to parse `stderr` for substrings and also check for HTTP status codes 402/429 is problematic. It's unclear how an HTTP status code would be reliably extracted from the `stderr` of a generic subprocess. This suggests an assumption about how the `run_codex_review` script works. If the script doesn't explicitly emit "HTTP 429", this check is useless. Relying on case-insensitive string matching of error messages is notoriously fragile, as provider error messages change without notice. The check should be a single, robust function that relies only on the most stable signal available (e.g., a specific exit code from the wrapper script, if possible) rather than a composite check of unstable signals.

### MEDIUM

- **F-04: `[UNVERIFIED]` Smoke test harness has an unclear contract.** FR-009 specifies running the test from the repo root but redirecting `FACTORY_RUNS_ROOT` via an environment variable. This is a reasonable pattern, but it assumes that no other part of the system resolves paths relative to the `feature-runs` directory via hardcoded paths or other mechanisms that would ignore the environment variable. It also doesn't account for `git` commands that need to be run within the fixture. The spec should explicitly state that the test harness requires the tested code to respect `FACTORY_RUNS_ROOT` for all workflow file I/O and that any `git` operations must be mocked or executed against a temporary git repository created within the fixture.

- **F-05: Implementation override reason is too permissive.** FR-014 requires the override reason to be at least 10 characters after stripping whitespace. This is trivial to defeat with placeholder text like "asdfasdfasdf". The check should be stronger, such as requiring at least two words, to nudge the operator toward providing a meaningful explanation.

- **F-06: `[UNVERIFIED]` Assumed idempotency key for plan.md is ambiguous.** FR-004 states the plan.md entry is "dedup'd by `review:` line key". This key is not defined. If the key is just the review file path, what happens on a re-run if the status or note changes? Does it update the existing line, or fail, or add a second entry? The desired behavior (update in place) should be explicitly specified to prevent ambiguity.

### LOW

- **F-07: Hardcoded link in resolution note.** FR-006 suggests a hardcoded link to `chatgpt.com`. This could become stale. It would be better to point to an internal documentation page (e.g., `docs/backend/llm-providers.md` from the file tree) that contains the up-to-date link and other relevant information about quota management. This centralizes provider-specific details.

- **F-08: Docs-only PRs trigger implementation warning.** The "Edge cases" section correctly identifies that a large docs-only PR will trigger the implementation rule warning. It states this is "acceptable" and the operator can use the override. However, this adds friction to a common, valid workflow. The file-type filtering in FR-012/FR-016 should be improved to exclude documentation file types (`*.md`, `*.txt`, etc.) to prevent these false positives.

## Residual Risks

- **Risk R1: Quota detection logic remains the most fragile part of the spec.** Even with improvements, relying on parsing subprocess output from an external API call is inherently unstable. The risk of false negatives (a real quota error is missed and marks the review as `failed`) or false positives (a different error containing the magic string marks a review as `deferred`) remains. The business impact is a blocked or misrouted workflow, requiring manual intervention.
- **Risk R2: The implementation rule's effectiveness is unproven.** The rule is designed to surface a process deviation, but it relies on a simple heuristic (line count) that is easily gamed or inaccurate. It may create more noise (false positives on refactors) than signal (catching lazy deviations), leading operators to habitually ignore or override it, defeating its purpose. The true risk is that the team relies on this automated check and stops performing more substantive manual review of implementation choices.
- **Risk R3: The "atomic" reconcile helper creates a false sense of security.** Despite warnings in the FRs, the "atomic" naming in the user story (US1) may lead future developers to believe it provides transactional guarantees it does not. The risk is that they will build new logic on top of this helper with the wrong assumptions, leading to subtle and difficult-to-diagnose data consistency bugs if a mid-operation failure occurs.

## Token Stats

- total_input=17053
- total_output=1420
- total_tokens=19448
- `gemini-2.5-pro`: input=17053, output=1420, total=19448

## Resolution
- status: accepted
- note: Addressed during spec/plan/tasks rounds (see plan.md reconciliation rollup).
