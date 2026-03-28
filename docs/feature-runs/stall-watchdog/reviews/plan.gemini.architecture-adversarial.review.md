---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/stall-watchdog/plan.md"
artifact_sha256: "3e80be95fdaa13bb3a8ac657961ba293c58353bd9d6e2889fff1b106899267c7"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Schema annotation fixed. signalRunActivity gated on totalStalled>0 not newStalls>0. First-probe stall fixed: use run.startedAt as fallback baseline. Status transition sites enumerated in plan. PgBoss index noted. N+1 deferred: acceptable at current scale. Race condition rejected: one-tick window, acceptable. FR-012 maintained dropped: false positive <3min resolves before next scheduler cycle. Infinite scheduler loop rejected: desired behavior."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **High Risk of Race Conditions from Clock Skew.** The core detection logic in `detectStalledModels` is flawed. It compares timestamps fetched from the database (`runStartedAt`, `completed_at`) against the application server's current time (`now`). In a distributed environment with multiple app servers or any clock drift between the app server and the database, this will lead to incorrect stall calculations. A 3-minute threshold can be easily voided by a few seconds of skew, causing false positives or, worse, missed stalls. The comparison should be performed within the database using `NOW()` or timestamps should be consistently sourced from a single source of truth.

2.  **Sequential Processing Creates a Scalability Bottleneck.** The `detectAndUpdateStalledRuns` function iterates through all `RUNNING` runs one-by-one. Each iteration involves multiple database queries. If the number of concurrent runs grows, this function's execution time will increase linearly, potentially taking longer than the scheduler interval itself. This would cause significant delays in stall detection and could overload the scheduler. The processing of runs should be parallelized (e.g., using `Promise.all`).

3.  **Error-Prone Manual State Clearing.** The plan relies on a developer manually finding every single `db.run.update` call that transitions a run to a non-RUNNING state to add `stalledModels: []`. This is extremely fragile. Missing even one code path will cause stale `stalledModels` arrays to persist on completed, paused, or failed runs, leading to incorrect state and potential downstream bugs. A more resilient solution like a centralized state transition function or a database-level trigger would be more appropriate for this critical cleanup step.

4.  **Poor User Experience in Frontend Banner.** The plan specifies rendering raw model IDs (e.g., `deepseek-coder-v2`) in the stall banner. This is not user-friendly and presents internal system identifiers to the end-user. The frontend `Run` object contains the necessary model list to map these IDs to human-readable `displayName`s ("DeepSeek Coder V2"). Overlooking this translation delivers a confusing and unprofessional user experience.

5.  **Brittle Job Identification Logic.** The `pgboss` query relies on `name = 'probe_scenario' OR name LIKE 'probe_scenario_%'`. This pattern matching on a string is not robust. Future changes to job naming conventions or the introduction of similarly named but unrelated jobs could break the entire stall detection mechanism by either including incorrect jobs or excluding correct ones. The job data should include a specific, queryable field like `jobGroup: 'probe'` to make this lookup reliable.

## Residual Risks

1.  **One-Size-Fits-All Stall Threshold.** The plan uses a single, hardcoded 3-minute threshold. This assumes all LLM providers have similar performance characteristics, which is an incorrect assumption. Slower, more complex models may be perpetually and incorrectly flagged as stalled, while very fast models may not be flagged for a long time after they have genuinely failed. This reduces the accuracy and reliability of the feature.

2.  **False Positives on Resume.** The plan explicitly drops the requirement for a grace period after a run resumes from a `PAUSED` state. This is a conscious trade-off, but it guarantees that users will see brief, incorrect "stalled" banners on the first scheduler tick after resuming a run. This is a known and accepted UX defect.

## Token Stats

- total_input=1489
- total_output=731
- total_tokens=22336
- `gemini-2.5-pro`: input=1489, output=731, total=22336

## Resolution
- status: accepted
- note: Schema annotation fixed. signalRunActivity gated on totalStalled>0 not newStalls>0. First-probe stall fixed: use run.startedAt as fallback baseline. Status transition sites enumerated in plan. PgBoss index noted. N+1 deferred: acceptable at current scale. Race condition rejected: one-tick window, acceptable. FR-012 maintained dropped: false positive <3min resolves before next scheduler cycle. Infinite scheduler loop rejected: desired behavior.
