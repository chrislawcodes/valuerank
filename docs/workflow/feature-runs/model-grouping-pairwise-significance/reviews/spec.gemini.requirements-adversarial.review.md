---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/model-grouping-pairwise-significance/spec.md"
artifact_sha256: "a9b56f8a04671644bc62e347c9e785e14aca1b738d2681d4f1f9fef9f188de44"
repo_root: "."
git_head_sha: "3a5af11db33c010c8b6f91c57141ca0042ad4560"
git_base_ref: "origin/main"
git_base_sha: "d7d5907a3652d38fb68d434385e2f7b4a273c36d"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/model-grouping-pairwise-significance/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Undefined Core Metric Leads to Inconsistency

**Severity: HIGH**

The spec’s unit of analysis is an "average score per vignette," but "score" is never defined. The surrounding application code and context reveal multiple distinct, competing metrics that this new feature ignores. Specifically, `ModelsGroups.tsx` includes a `dataSource` state that allows the user to toggle the existing cluster visualizations between `'log-odds'` and `'win-rate'`. The new significance report is not specified to react to this control. This will create a confusing and misleading user experience where the main cluster visualizations could be based on one metric (e.g., win-rate) while the statistical significance report at the bottom of the page is based on another (e.g., log-odds), without any indication to the user. The methodology is therefore not just undefined, it is disconnected from the interactive context it will inhabit.

**Evidence: [CODE-CONFIRMED]**
The code in `ModelsGroups.tsx` explicitly defines and manages the `dataSource` state (`const [dataSource, setDataSource] = useState<'log-odds' | 'win-rate'>('log-odds');`), which is then passed to `ModelGroupsSection` and `ModelAnalysisSettingsBar`. The spec for the new significance report makes no mention of this `dataSource` and does not specify how it should adapt its own "score" metric, creating a guaranteed inconsistency.

### 2. Report Ignores Critical Page-Level Filters

**Severity: HIGH**

The spec states that the report "uses only the models currently selected in the page filter" but is silent on all other critical filters that govern the page's data. The `ModelsGroups.tsx` component is controlled by `selectedScope` ('ALL_DOMAINS' vs. a single domain), `selectedDomainId`, and `selectedSignature`. These states directly control the variables for the GraphQL queries that fetch the page's data. By ignoring these filters, the spec creates a major ambiguity: will the significance report operate on "all domains" data even when the user has filtered to a single domain? Will it ignore the signature filter? This omission guarantees that the new report will either not respond to the page's primary controls or will be implemented with implicit assumptions that contradict the user's view of the data, undermining the feature's reliability.

**Evidence: [CODE-CONFIRMED]**
`ModelsGroups.tsx` clearly shows state and effects for `selectedDomainId`, `selectedScope`, and `selectedSignature`, which are used to construct the variables for `DOMAIN_ANALYSIS_QUERY` and `MODELS_ANALYSIS_QUERY`. The `models-analysis.ts` API resolver also accepts `domainId` and `signature` arguments. The feature spec for the new report does not account for how it will integrate with this existing, fundamental filtering logic.

### 3. Vague Failure Condition for Incomplete Data

**Severity: MEDIUM**

The requirement to "fail loudly" if "vignette coverage is incomplete" is a good principle, but "vignette coverage" is not defined with enough precision. Given the page's existing `selectedScope` and `selectedDomainId` filters, the definition of the required vignette set is ambiguous. Does "complete coverage" mean every selected model must have data for every vignette within the `selectedDomainId`? Or across all domains if the scope is `ALL_DOMAINS`? What if a `signature` is also applied? Without a precise definition of the expected vignette set based on the page's filters, this "hard failure" condition is unimplementable as specified. It risks being either too strict (failing constantly) or too loose (allowing comparisons on mismatched data sets), which defeats the purpose of the requirement.

**Evidence: [CODE-CONFIRMED]**
The code in `ModelsGroups.tsx` and the `models-analysis.ts` resolver demonstrates that data is fetched within a specific scope (`domainId`, `signature`). The spec's failure condition must be defined in terms of this same scope to be meaningful, but it currently is not.

### 4. Contradictory and Inefficient Data Contract

**Severity: MEDIUM**

The spec's "Data Contract" section is contradictory. It states the backend must provide both the low-level `average score per vignette per selected model` and the final, high-level outputs like `pairwise test result` and `corrected p-value`. This is redundant. The backend should provide one or the other. If it provides vignette-level data, the client performs the tests. If it provides the final results, it should not also need to send the underlying data that was used to generate them. This suggests a lack of a clear architectural decision on the division of responsibilities, which will lead to wasted effort and a potentially inefficient implementation.

**Evidence: [UNVERIFIED]**
This is a logical flaw within the spec for a new feature. Existing code cannot directly confirm or refute the implementation of a future data contract, but the contradiction is inherent to the spec document itself.

## Residual Risks

-   **User Frustration:** The "fail loudly" requirement for incomplete data, while correct, may lead to a frustrating user experience if the underlying data sources are frequently incomplete. The feature may appear to be perpetually broken to end-users.
-   **Information Overload:** As noted in the spec, the table can become very dense very quickly as more models are selected (e.g., 8 models yields 28 pairwise comparisons). This risks overwhelming the user and making the report difficult to interpret, despite its statistical validity.
-   **Misinterpretation of "Weak" vs. "Not significant":** The distinction is statistically sound but may be subtle for users. There is a risk that users will misinterpret "Weak" (statistically significant, but small effect) as being functionally equivalent to "Not significant," leading them to draw incorrect conclusions. The UI design will need to be very clear to mitigate this.

## Token Stats

- total_input=30342
- total_output=1268
- total_tokens=34456
- `gemini-2.5-pro`: input=30342, output=1268, total=34456

## Resolution
- status: open
- note: