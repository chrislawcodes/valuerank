---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/full-pvq-survey/spec.md"
artifact_sha256: "beaf5a3b0a80ecee270b1734b9cae8b983d4ed19b864684545f57dd11e3337c5"
repo_root: "."
git_head_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
git_base_ref: "origin/main"
git_base_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM 1 (framing contradiction on list page): FIXED — FR-016 clarified that list page shows per-framing counts and must not imply survey-level framing. MEDIUM 2 (brittle output contract): REJECTED — explicit user policy, any missing score = full trial refusal. MEDIUM 3 (samplesPerScenario underspecified): FIXED — added FR-017 and updated US1-AC1. MEDIUM 4 (no versioning/immutability): ACCEPTED — strengthened Residual Risk 1 with future-work note. MEDIUM 5 (removed model display name): FIXED — edge case updated to require model name snapshot at trial creation time."
raw_output_path: "docs/workflow/feature-runs/full-pvq-survey/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. Medium: The framing ownership is contradictory. The background and FR-001 say framing is a run property, but US1 and the survey list requirement still talk as if a survey itself has a framing. A single survey can accumulate both framings over time, so the list page cannot truthfully show one survey-level framing without leaking the wrong mental model.

2. Medium: The output contract is too brittle for a real LLM workflow. A harmless deviation like a preface, reordered line, or slightly malformed answer turns the whole trial into a refusal, and the spec gives no retry, normalization, or partial salvage path. That makes the feature likely to produce empty or badly biased results even when the model mostly answered correctly.

3. Medium: `samplesPerScenario` is underspecified. The entity says a Full PvqTrial is one per model per `samplesPerScenario` per run, but the user stories only describe one prompt per model and never say how multiple samples are launched, numbered, or distinguished on the detail page. Anything above 1 is left to implementation guesswork, which makes counts and audit trails ambiguous.

4. Medium: There is no explicit versioning or immutability rule tying a survey to the exact prompt/question mapping it used. Because results are aggregated across all runs ever for a survey + framing, any later wording change can silently contaminate historical averages unless someone manually creates a new survey. The spec treats that as a convention, not an enforced invariant.

5. [UNVERIFIED] Medium: The "removed model" edge case assumes you can still recover the last known model display name after deletion, but the spec never stores a historical name snapshot on the trial or result records. Unless the existing model system already preserves deleted names, the required "(removed)" column label cannot be rendered later.

## Residual Risks

- Query-time aggregation will get slower as trial volume grows, especially because the page has to recompute results across all runs on read.
- The no-pagination trial detail page still assumes a small dataset; it will become awkward once trial counts move beyond the stated ceiling.
- Mean-only summaries still hide distribution shape, so two very different model behaviors can look identical in the grid.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM 1 (framing contradiction on list page): FIXED — FR-016 clarified that list page shows per-framing counts and must not imply survey-level framing. MEDIUM 2 (brittle output contract): REJECTED — explicit user policy, any missing score = full trial refusal. MEDIUM 3 (samplesPerScenario underspecified): FIXED — added FR-017 and updated US1-AC1. MEDIUM 4 (no versioning/immutability): ACCEPTED — strengthened Residual Risk 1 with future-work note. MEDIUM 5 (removed model display name): FIXED — edge case updated to require model name snapshot at trial creation time.
