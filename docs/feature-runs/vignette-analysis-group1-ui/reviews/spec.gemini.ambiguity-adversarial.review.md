---
reviewer: "gemini"
lens: "ambiguity-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/vignette-analysis-group1-ui/spec.md"
artifact_sha256: "ae3b480012162fa284f1fbfb541a27451a6ae1491ee190de0f6df1e3e0fc6cec"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The spec now names the V2 detection rule, badge trigger rule, and copy map so the mixed-data behavior is unambiguous."
raw_output_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/spec.gemini.ambiguity-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec ambiguity-adversarial

## Findings

1.  **High Severity: Undefined Mixed-Data Detection Mechanism.** The spec mandates that a UI surface must fall back to "legacy mode" if it is not "fully V2-backed," but it fails to define how the frontend should detect this state. This is the most critical ambiguity. It leaves core implementation questions unanswered:
    *   How does a page like `AnalysisTranscripts.tsx` determine if a list of transcripts is "fully V2-backed"?
    *   Is there a summary flag on the parent data object, or must the client fetch and iterate through all transcript records to check their version? The latter approach could create significant performance bottlenecks for large data sets.
    *   What specific field, flag, or data shape distinguishes a "V2-backed" transcript from a legacy one? Without this, the primary logical condition of the feature is based on an assumption.

2.  **Medium Severity: Incomplete Specification of Decision Wording.** The spec requires showing "plain-language decision summaries" and provides three examples (`Strongly favors X`, `Somewhat favors X`, `Neutral`). This is insufficient.
    *   It omits the full enumeration of possible decision types. The implementation will be fragile if the backend can return other states (e.g., `Slightly favors`, `Strongly disfavors`, `Indifferent`) that are not accounted for.
    *   It does not specify the source data field(s) from which these strings are derived. It's unclear if the frontend is mapping an enum (e.g., `decision: 'STRONGLY_FAVORS'`) to a string or if the backend provides these strings directly. Since backend changes are out of scope, the source field must already exist, but it is not identified.

3.  **Medium Severity: Ambiguous Condition for "Fallback" Badge.** The spec requires a "deterministic/fallback badge" to appear "only when the transcript was not summarized deterministically." This condition is ambiguous.
    *   It fails to name the specific data field and value (e.g., `summaryMethod: 'fallback'`, `isDeterministic: false`) that should trigger the badge's visibility. This leaves the trigger condition open to interpretation.
    *   The phrase "only when it is useful" is subjective and should be replaced with the precise data-driven rule.

4.  **Low Severity: Subjective Definition of "Score-First Language."** The goal to "stop teaching score-first language" is not grounded in concrete examples. The spec does not provide a single "before and after" example of a label or piece of helper text. This ambiguity makes the scope of copywriting changes unclear and risks an inconsistent or incomplete implementation.

5.  **Low Severity: Missing Explicit Test Case for Mixed Data.** The acceptance criteria correctly state that mixed data should trigger legacy mode, but this critical edge case is not explicitly called out as a required scenario in the testing scope. This increases the risk that the "all-or-nothing" legacy mode fallback for mixed lists will not be tested properly.

## Residual Risks

1.  **Performance Risk.** The lack of a defined mixed-data detection strategy may lead to a naive client-side implementation that iterates over large lists of transcripts, causing UI latency on pages intended for analysis.
2.  **Fragile UI Risk.** If the backend returns a decision enum value not anticipated by the examples in the spec, the UI may fail to render the decision, display a broken string, or even crash. The mapping from data to presentation is brittle.
3.  **Scope Creep / Incomplete Work Risk.** The ambiguous definition of "score-first language" may cause developers to either under-deliver by only changing the most obvious labels or over-deliver by refactoring copy that was not intended to be changed, leading to wasted effort and review churn.
4.  **Regression Risk.** The "mixed-data" scenario is a non-obvious business rule. Without a dedicated, explicit test case, it is at high risk of being broken by future changes to the transcript components or data-fetching logic.

## Token Stats

- total_input=1596
- total_output=867
- total_tokens=15880
- `gemini-2.5-pro`: input=1596, output=867, total=15880

## Resolution
- status: accepted
- note: The spec now names the V2 detection rule, badge trigger rule, and copy map so the mixed-data behavior is unambiguous.
