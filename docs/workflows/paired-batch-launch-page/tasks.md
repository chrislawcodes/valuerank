# Paired Batch Launch Page Tasks

## Current Status

Implementation, verification, diff reconciliation, and closeout are complete.

## Task List

- [x] Record the feature scope and assumptions in the workflow trail
- [x] Confirm the launch popup is the definition-detail paired-batch modal
- [x] Write the spec and plan for the dedicated page flow
- [x] [CHECKPOINT] Slice 1: add `StartPairedBatchPage`, register its route, and wire `DefinitionDetail` to navigate there instead of opening the modal, including direct-route, invalid-route, back/cancel, and eligibility handling (~180 LOC)
- [x] [CHECKPOINT] Slice 2: update glossary-aligned copy and the batch-size / batches-per-vignette layout, keep loading/error/retry state visible, and add focused page and consumer tests (~240 LOC)
- [x] Verify the paired-batch launch still submits through the existing mutation path and remains `PRODUCTION`
- [x] Run the targeted web test suite (`DefinitionDetail.test.tsx`, `StartPairedBatchPage.test.tsx`, `RunForm.test.tsx`) plus the API run mutation test
- [x] Run web lint and typecheck
- [x] Remove the old modal entry point from the live flow and delete the dead modal file
- [x] Write the implementation diff artifact and reconcile review findings
- [x] Close out the workflow after verification passes
