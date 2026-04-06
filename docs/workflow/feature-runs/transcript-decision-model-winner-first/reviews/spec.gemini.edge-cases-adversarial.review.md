---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/spec.md"
artifact_sha256: "f700cf0f8ff2a01f2f962c243cc19a8001231b42c7a373aca172ed2356ac68a3"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **`favoredValueKey: null` is dangerously ambiguous.** The spec conflates a deliberate "neutral" outcome (e.g., "both values are equally important") with an "unresolved" processing failure (e.g., ambiguous, refused, or unparseable response). Storing both as `null` loses critical analytical fidelity. It makes it impossible to distinguish between a model that is carefully balanced and one that is evasive or non-compliant. This will obscure important behavioral patterns and poison metrics that need to count refusals or errors separately from deliberate neutrality.

2.  **The "correct" normalization logic is completely undefined.** The spec's primary goal is to "pool paired vignette runs safely," but it fails to define the actual normalization algorithm. It states that `direction` is "derived" and that the analysis layer will "Convert transcript decisions into canonical buckets," but provides no rules for *how* this is done. This omits the most critical part of the entire proposal. Without a clear definition of the normalization logic, the acceptance criterion "pool A-first and B-first runs correctly" is untestable and meaningless.

3.  **The "no backfill" strategy creates a high-risk legacy pathway.** The proposal to support legacy transcripts via a "compatibility path" while new transcripts use the winner-first model introduces significant complexity and risk. It requires maintaining two separate data interpretation pipelines in the analysis layer. This dual-path logic is a common source of subtle, long-term bugs where the two paths diverge in behavior over time. The spec provides no plan for managing, testing, or eventually deprecating this second pathway, creating a permanent maintenance burden and a high-risk surface for future errors.

## Residual Risks

1.  **Dramatic, unexplained shifts in report metrics.** The spec correctly notes that report totals may change as a result of fixing mis-normalized B-first runs. However, it fails to address the operational risk of this change. If a key metric swings significantly, users will perceive it as a regression. There is no plan for validating the impact of the new counting method against the old one, nor a strategy for communicating to users that the reports are now "more correct" rather than "broken."

2.  **Chained fallacies in derived fields.** The model proposes `direction` is derived from `favoredValueKey` and `presentationOrder`. If the upstream parsing of the raw transcript into `favoredValueKey` is flawed or biased in any way, that error will be silently propagated into the "correct" canonical `direction`. The model assumes perfect parsing into `favoredValueKey`, which is a weak link in any LLM-based analysis. An error in identifying the winner gets laundered into a seemingly-valid, but incorrect, directional data point.

3.  **Neutral outcomes become indistinguishable from edge-case processing failures.** By lumping "neutral" with "unresolved," there's a risk that an increase in parsing errors or model refusals could be misinterpreted as a trend of models becoming more "neutral" or "balanced" in their judgments. This could lead analysts to draw the exact opposite conclusion from what the data actually indicates. The system's inability to differentiate these cases could mask serious data quality problems.

## Token Stats

- total_input=2046
- total_output=680
- total_tokens=16365
- `gemini-2.5-pro`: input=2046, output=680, total=16365

## Resolution
- status: open
- note: