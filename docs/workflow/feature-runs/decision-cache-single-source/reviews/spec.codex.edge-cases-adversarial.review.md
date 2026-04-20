---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/decision-cache-single-source/spec.md"
artifact_sha256: "f47924c7cbf0a1cb6990765d3874d0e032bac77eab8f7d53c509a8dd9ee13350"
repo_root: "."
git_head_sha: "4201294766a93a21d6bc5c872aee243032e60b58"
git_base_ref: "origin/main"
git_base_sha: "4201294766a93a21d6bc5c872aee243032e60b58"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/decision-cache-single-source/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High:** `FR-012` and `SC-002` conflict on malformed or missing snapshots. The migration is told to **skip** rows with a missing/malformed `definition_snapshot`, but the success criteria require **zero** `decisionCode` residue in `summaryCache`. If a skipped row still has `decisionCode`, the migration cannot satisfy the stated postcondition. If the intent is to leave those rows alone, `SC-002` needs an explicit exception; if the intent is to clean them too, the spec needs a safe fallback path.
- **High:** The source of truth for `orientationFlipped` is contradictory, and the chosen live join is unsafe for backfill. `FR-013` says to read `scenarios.orientation_flipped` through `transcripts.scenario_id`, but the edge-case notes say the migration should use the transcript’s scenario content snapshot. Those are not the same thing. Using the live scenario row can retroactively change historical decision mapping if the scenario was edited after the transcript was created.
- **Medium:** [UNVERIFIED] The manual-override contract is underspecified for flipped definitions. The accepted payloads and validation table are written only in terms of `pair.valueA/valueB`, but the spec does not say how the UI payload’s `direction` is normalized when `orientationFlipped = true`. That leaves room for valid overrides on flipped prompts to be rejected or applied against the wrong favored value.
- **Medium:** `FR-012` does not define a valid fallback for rows where `canonicalDecision` is missing and `decisionCode` is absent. The instruction to “preserve the existing cacheVersion: 1 canonical values verbatim and only bump cacheVersion to 2” assumes a canonical payload already exists. For rows where it does not, the migration has no stated behavior, so implementations could silently write an invalid v2 record or skip the row without counting it correctly.

## Residual Risks

- Rows skipped because their snapshot is malformed will still need manual cleanup if strict `SC-002` compliance is required.
- The top-level `transcripts.decision_code` column remains untouched, so any code path that still reads it directly can continue to see stale values until the follow-up PR lands.
- The rollout-window refusal compat path increases complexity until the migration completes; any delay extends the period where legacy v1 refusal rows depend on the compatibility branch.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
