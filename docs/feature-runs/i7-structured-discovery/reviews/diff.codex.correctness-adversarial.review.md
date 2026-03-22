---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/i7-structured-discovery/reviews/implementation.diff.patch"
artifact_sha256: "c5bac998c3e5564afa9dd59438661cb7f5d19e4720025e0238a878eb1e9c30db"
repo_root: "."
git_head_sha: "1310e207293440894fe2a6092ff537d450c8a993"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "fixed: version type guard, non-string question skip, unhashable item filter all added. migrate not wired yet — correct, Wave 2 scope."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **High**: `migrate_discovery_state()` is still not actually safe for malformed inputs. `d.get("version", 1) >= 2` will throw if `version` is a non-numeric type, `q.get("question")...strip()` will throw if a truthy `question` value is not a string, and `{u["item"] for u in d["unresolved"]}` will throw if any `item` is unhashable. That directly contradicts the helper’s stated “safe for malformed inputs” behavior and can crash the repair path instead of recovering it. [factory_state.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/factory_state.py#L151)
- **Medium**: The patch adds the migration helper and bumps the default schema, but nothing in the shown diff wires `migrate_discovery_state()` into a runtime load/repair path. If there is no unseen caller already doing that, persisted v1 discovery blobs will still be consumed as v1 and never gain the new `answers`, `non_goals`, `acceptance_criteria`, or `unresolved` fields. [factory_state.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/factory_state.py#L133)
- **Medium**: The `version >= 2` early return means partially corrupted V2 blobs are never normalized. Any V2 state missing the new keys, or carrying malformed `unresolved` entries, will be returned unchanged and can still fail later. That makes the helper a one-way upgrader rather than a repair function for bad on-disk data. [factory_state.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/factory_state.py#L151)

## Residual Risks

- The migration deduplicates only by exact question text; whitespace and casing differences can still produce duplicate unresolved items.
- The helper uses a shallow copy, so nested mutable structures remain shared with the input on the migrated path.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: fixed: version type guard, non-string question skip, unhashable item filter all added. migrate not wired yet — correct, Wave 2 scope.
