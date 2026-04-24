---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "4519e751b65d7f72d73c1f2323a8d751ae2c48dc293e83854252d503c60bcb18"
repo_root: "."
git_head_sha: "f274b57cc2b9bf75e7e01d2c1041461c7767dd81"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (brittle veto): same as feasibility — structured signal now mandatory. MEDIUM (registry scope): FR-009 enumerates from argparse dispatcher, not command_* scan. MEDIUM (init misclassified): FR-011 reclassifies init as @mutates_state. MEDIUM (intermediate count): FR-015 canonical list is 5 globs, referenced consistently."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- High: FR-002 makes the completeness veto depend on free-form judge prose plus an optional regex fallback. That is too brittle for a safety gate. A wording change, prompt tweak, or copy edit can either fire the veto on the wrong case or miss a real unaddressed HIGH. Because FR-016 is optional, the spec still allows the feature to ship with regex as the only enforcement path.
- Medium [UNVERIFIED]: The mutating-command registry only covers `command_*` functions, but the spec already exempts `run_judge` as a lambda-invoked path. If the current codebase has any state-mutating entrypoint outside that naming pattern, this fix will not register it and the invariant self-check can still be bypassed. This depends on existing code shape.
- Medium [UNVERIFIED]: FR-008 marks `init` as read-only without stating that it has zero persistent side effects. If `init` creates or seeds state, excluding it from `mutates_state` reintroduces the same drift hole this feature is trying to close. The spec needs to pin down that `init` is truly side-effect free, or classify it as mutating.
- Medium: US3 is internally inconsistent about the cleanup target set. The summary, FR-011, and the US3 test/scenario text disagree on whether there are four or five intermediates and which suffixes are authoritative. That ambiguity makes it easy to ship a GC that misses `.narrowed.json` or deletes the wrong file class without the spec clearly failing it.

## Residual Risks

- If FR-016 stays out of scope, completeness veto behavior will still be sensitive to prompt wording and reasoning format drift.
- The GC still only covers the explicitly named suffixes in FR-011, so any future intermediate file shape will need an explicit spec update.
- The registry approach still assumes the project keeps using the `command_*` naming convention; any new mutation path outside that pattern will need a manual convention update.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (brittle veto): same as feasibility — structured signal now mandatory. MEDIUM (registry scope): FR-009 enumerates from argparse dispatcher, not command_* scan. MEDIUM (init misclassified): FR-011 reclassifies init as @mutates_state. MEDIUM (intermediate count): FR-015 canonical list is 5 globs, referenced consistently.
