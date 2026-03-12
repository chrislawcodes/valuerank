---
reviewer: "codex"
lens: "architecture"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank-run-form-split/docs/workflows/run-form-split/spec.md"
artifact_sha256: "2f733bbf744d02b873049d655f95e96644c10232c5733fbf9581a0a8f408f16b"
repo_root: "/Users/chrislaw/valuerank-run-form-split"
git_head_sha: "878a4ba0184013c98215f1cb3df1d9e6b99e0956"
git_base_ref: "upstream/main"
git_base_sha: "878a4ba0184013c98215f1cb3df1d9e6b99e0956"
resolution_status: "accepted"
resolution_note: "Keep RunForm as the public shell and keep new files local to the run form surface."
raw_output_path: ""
---

# Review: spec architecture

## Findings

No architecture findings.

The spec picks a safe boundary for the next frontend compaction slice. It keeps `RunForm.tsx` as the public shell, avoids the order-effect area, and limits the extraction to local run-form concerns instead of spreading changes across the broader run system.

## Residual Risks

- The split stays useful only if `useRunForm.ts` owns state and derived form logic without turning into a second catch-all module for rendering concerns.
- `DefinitionPicker.tsx` could become too broad if it absorbs both the condition modal and all final-trial detail logic without clear props. The implementation should keep that boundary simple.
- This slice has two consumers, so the shell must preserve the current prop contract exactly or the refactor will create avoidable follow-up churn in `RerunDialog.tsx` and `RunFormModal.tsx`.

## Resolution
- status: accepted
- note: Keep RunForm as the public shell and keep new files local to the run form surface.
