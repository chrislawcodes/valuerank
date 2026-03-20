---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflows/paired-batch-launch-page/reviews/implementation.diff.patch"
artifact_sha256: "f739d27c515814eddb7c0e26a428ecf76a95be970b32cfba931ee23f7eb4e1d4"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The apparent inconsistency is intentional and now communicated by the button labels: standard vignettes still use the modal Start Trial flow, while job-choice vignettes use the dedicated paired-batch route. The other comments are design tradeoffs or future-scaling concerns rather than correctness bugs for this slice."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

1.  **Severity: Medium. UX Inconsistency and Predictability.** The `onStartRun` handler in `DefinitionDetail.tsx` directs the user to one of two distinct UI flows (a modal popup vs. a full-page navigation) based on the `methodology.family` of the current vignette. This conditional routing happens without any apparent change in the UI of the trigger button itself (e.g., its label or icon). This makes the application's behavior unpredictable. A user has no way to know in advance whether clicking "Start Run" will keep them on the current page or navigate them to a new one, which can be a confusing and jarring experience.

2.  **Severity: Low. Hardcoded Workflow Routing.** The logic that determines which run workflow to use (`methodology?.family === 'job-choice'`) is hardcoded within the `handleStartRun` function. While this is sufficient for a single special case, it does not create a scalable pattern. If more methodology families require unique run-configuration pages in the future, this component will have to be modified with additional `if/else` or `switch` statements, increasing its complexity and making it a potential bottleneck for introducing new workflows.

3.  **Severity: Minor. Prop Drilling.** The new `copyMode` prop is introduced at a high level (`StartPairedBatchPage`, `DefinitionDetail`) and passed down through `RunForm` into `DefinitionPicker` and `RunConfigPanel`. While the current depth of three levels is manageable, this is a classic example of prop drilling. It increases the boilerplate required to connect components and could become cumbersome if the component hierarchy deepens.

4.  **Severity: Minor. Incomplete UI Abstraction in `RunForm`.** The new `div` wrapper in `RunForm.tsx` that switches between `grid` and `space-y` layout based on `copyMode` is a layout-specific concern. By placing this logic inside `RunForm`, the component becomes less reusable, as it now makes assumptions about how its internal components (`DefinitionPicker`, `RunConfigPanel`) should be laid out in different modes. This responsibility might be better handled by the parent component that is composing the form.

## Residual Risks

1.  **User Confusion and Training Overhead.** The primary residual risk is user confusion stemming from the inconsistent behavior of the "Start Run" action. Users may perceive the application as buggy or unpredictable, leading to a lack of confidence and potentially increasing support requests. They may not understand the underlying domain logic (i.e., that 'job-choice' vignettes have a special workflow) and will be left to wonder why the UI behaves differently on different vignettes.

2.  **Testing and Maintenance Gaps.** The new `StartPairedBatchPage.tsx` introduces numerous conditional rendering paths for loading states, route validation failures, API errors, and eligibility checks (`isPairedBatchEligible`). If these paths are not covered by robust integration or end-to-end tests, there is a risk of them breaking in the future, leaving a user stuck on a loading screen or seeing an unhandled error, especially if they navigate to the URL directly with an ineligible ID.

3.  **Assumption of Component Equivalence.** The implementation assumes that the only differences between a "trial" and a "paired-batch" run configuration are labels and layout. A future requirement might necessitate fundamentally different input controls for one mode (e.g., a specific number input instead of a percentage selector for "Batch Size"). The current `copyMode` abstraction is not deep enough to handle such a divergence and would require significant refactoring, as the underlying state and controls are currently shared between modes.

## Token Stats

- total_input=4930
- total_output=771
- total_tokens=21251
- `gemini-2.5-pro`: input=4930, output=771, total=21251

## Resolution
- status: accepted
- note: The apparent inconsistency is intentional and now communicated by the button labels: standard vignettes still use the modal Start Trial flow, while job-choice vignettes use the dedicated paired-batch route. The other comments are design tradeoffs or future-scaling concerns rather than correctness bugs for this slice.
