---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/i7-structured-discovery/spec.md"
artifact_sha256: "eafa64781cfa17066bfa672f7c6b8e0642c7403adabaf0f162ef49e5a9d6cf3f"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "5 findings: text-key fragility accepted-limitation for agent use; deferred flag resolved: deferred items skip gate; CRUD incomplete accepted-limitation; migration handles malformed fields + populates unresolved from V1 questions when required+incomplete; Wave 4 ordering correct — runner has 33 refs to count fields"
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Critical Flaw: Fragile State Linkage.** The schema design relies on matching the full text of a question to link it to an answer (`answers` object key) and to manage its resolution (`--resolve TEXT`). This is brittle and guaranteed to fail. If a question is rephrased, edited for a typo, or contains complex characters, the link between the question, its answer, and its resolved state is broken. This should be replaced with a stable, unique identifier (e.g., a short hash of the initial question, a UUID, or even a simple integer index).

2.  **Ambiguous State Logic.** The relationship between the `questions`, `answers`, and `unresolved` arrays is unclear.
    *   If a question in `questions[]` is given an answer via `--answer`, is it automatically removed from `unresolved[]`? The spec implies these are separate operations (`--answer` and `--resolve`), which creates redundant work and risk of inconsistency. The workflow should be that answering a question implicitly resolves it.
    *   The `deferred` flag within an `unresolved` item is contradictory. The spec states that *any* item in `unresolved[]` blocks the checkpoint. If so, what does "deferring" an item accomplish? The semantics are undefined.

3.  **Incomplete CRUD Operations.** The proposed CLI flags only cover *adding* data (`--unresolved`, `--non-goal`, etc.) and one specific removal (`--resolve`). There are no corresponding flags for editing or removing non-goals, acceptance criteria, or even correcting an answer. This forces users to either abandon the CLI tooling and edit the JSON by hand (risking corruption) or live with mistakes. This undermines the goal of creating a structured, machine-readable state.

4.  **Optimistic Migration Plan.** The V1-to-V2 migration function is described as a "pure function" that "upgrades V1 blobs transparently". This assumes all V1 blobs are well-formed. The spec does not account for malformed or corrupted V1 `state.json` files. The migration logic should define a strategy for handling cases where, for example, `questions` is a `None` type or a string instead of a list.

5.  **Unnecessary State Redundancy.** Wave 4 proposes removing `question_count` and `asked_count`. Deferring this cleanup is a mistake. As soon as the new schema is in place (Wave 1), these fields become legacy. Keeping them through Waves 2 and 3 introduces a window of unnecessary complexity and potential for the derived counts to fall out of sync with `len(questions)` and `len(answers)`. They should be removed as part of Wave 1 or 2.

## Residual Risks

1.  **User Experience Failure.** The reliance on exact-text matching for core operations (`--resolve`, `--answer`) is not just fragile, it's a hostile user experience. Users will be forced into tedious copy-pasting of long question strings. This friction will encourage them to bypass the tool and edit the JSON directly, defeating the feature's purpose. The probability of this workflow being abandoned by users is high.

2.  **State Corruption via Manual Edits.** Because the CLI functionality is incomplete (lacks edit/delete), users will be forced to manually edit `state.json`. This creates a significant risk of syntax errors, broken state linkages (if they attempt to manually resolve a question), and schema violations that the migration and validation logic may not be prepared to handle.

3.  **Silent State Mismatches.** The ambiguity around the `deferred` flag and the `resolve` workflow could lead to a false sense of security. A team might believe they have "deferred" a critical open question, not realizing it still acts as a hard blocker. Or, they might resolve an item but fail to also record the answer, leaving the discovery state logically incomplete despite passing the validation gate.

4.  **Scope Creep in Implementation.** The underspecified nature of the migration and the relationship between state fields (`questions`, `unresolved`) will force the implementing agent/developer to make product decisions on the fly. This could lead to an implementation that diverges from the intended design or one that is more complex than anticipated because edge cases were not considered upfront.

## Token Stats

- total_input=1924
- total_output=915
- total_tokens=16814
- `gemini-2.5-pro`: input=1924, output=915, total=16814

## Resolution
- status: accepted
- note: 5 findings: text-key fragility accepted-limitation for agent use; deferred flag resolved: deferred items skip gate; CRUD incomplete accepted-limitation; migration handles malformed fields + populates unresolved from V1 questions when required+incomplete; Wave 4 ordering correct — runner has 33 refs to count fields
