# Feature Workflow Feedback

Feedback collected after workflow runs. Used to inform improvements to the runner,
skill docs, and process design.

---

## 2026-03-20 — Codex (workflow-runner-hardening + general feature delivery)

**Source:** Codex agent retrospective + human observation

### What worked
- Kept the change organized from spec → implementation → delivery
- Pushed toward small, reviewable slices instead of one large risky patch
- Helped keep product semantics, API, UI, and glossary aligned
- Checkpoint discipline made the work feel more reliable

### What didn't work
- **Runner fragility:** `run_feature_workflow.py status` failed due to missing `workflow_utils` import — the runner is not self-contained
- **Ceremony vs. value mismatch:** For semantic/UI/data-model alignment work the workflow felt heavier than the change warranted
- **Branch staleness not surfaced early:** Branch was behind `main` but the workflow didn't warn before PR creation; merge conflicts appeared after creation
- **Source-of-truth ambiguity:** Workflow state files felt duplicated; it wasn't always clear which files were authoritative vs. generated
- **Clunky CI monitoring:** Extra manual steps needed to determine whether CI checks were actually running
- **No upfront requirements clarification:** The workflow started work immediately without asking clarifying questions to scope or validate requirements

### Suggested improvements
1. Make runner self-contained and resilient to missing helper modules
2. Have `status` report whether branch is behind `main` before PR creation
3. Clarify in SKILL.md which workflow files are source-of-truth vs. generated state
4. Add a lighter execution path for straightforward delivery work (less ceremony for simple changes)
5. Improve CI visibility inside the workflow loop (surface check status in `status` output)
6. Add a requirements-clarification step before starting spec authoring — ask questions upfront rather than discovering ambiguity mid-pipeline

### Overall
Workflow is well-suited for complex, multi-stage features. Needs better tooling
reliability, upfront requirements clarification, and a lighter mode for routine delivery.
