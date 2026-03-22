---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/i7-structured-discovery/reviews/implementation.diff.patch"
artifact_sha256: "c5bac998c3e5564afa9dd59438661cb7f5d19e4720025e0238a878eb1e9c30db"
repo_root: "."
git_head_sha: "1310e207293440894fe2a6092ff537d450c8a993"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "single migration path intentional for Wave 1. Silent malformed-unresolved discard is intentional and tested. V2->V3 path deferred."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

1.  **Silent Discard of Malformed Data:** The migration logic for the `unresolved` field (`d["unresolved"] = [item for item in existing_unresolved if isinstance(item, dict) and "item" in item]`) will silently discard any pre-existing entries in a V1 state that are malformed (e.g., are not dictionaries or lack the required `"item"` key). While this makes the migration robust against corrupted data, it is a form of non-recoverable data loss for those specific entries. This behavior is intentional and explicitly tested in `test_migrate_sanitizes_malformed_unresolved_entries`.
2.  **Implicit Default Behavior for Missing Flags:** The logic for populating `unresolved` items from V1 questions depends on the `required` and `complete` flags. If a V1 state is missing the `required` flag (`d.get("required")`), it is treated as `False`. If it is missing the `complete` flag (`not bool(d.get("complete"))`), it is treated as `False` (`incomplete`). These are safe defaults but rely on implicit boolean casting of `None` which could be non-obvious to future maintainers.
3.  **Question Migration Logic is Not Applied Universally:** V1 `questions` are only migrated to the new V2 `unresolved` list if the discovery state is both `required: True` and `complete: False`. V1 states that are already marked `complete` or are not `required` will have their `questions` data preserved but not migrated into the new `unresolved` structure, which appears to be the intended behavior.

## Residual Risks

1.  **Shallow Copy Brittleness:** The migration uses `d = dict(d)` to create a shallow copy, ensuring the top-level input dictionary isn't mutated. However, any nested mutable objects (e.g., dictionaries within the `questions` list) are not deep-copied. The current implementation is safe as it only reads from these nested objects. A future modification that attempts an in-place mutation of a nested object would break the guarantee of immutability and could introduce side effects.
2.  **Single-Version Migration Path:** The function is tightly coupled to a single V1 -> V2 upgrade path. The idempotency check (`if d.get("version", 1) >= 2:`) correctly prevents it from running on V2+ data, but it provides no mechanism for future migrations (e.g., V2 -> V3). Maintaining this will require a new, separate migration function and potentially a migration chain orchestrator if V1 blobs ever need to be upgraded directly to V3+.

## Token Stats

- total_input=3892
- total_output=574
- total_tokens=19528
- `gemini-2.5-pro`: input=3892, output=574, total=19528

## Resolution
- status: accepted
- note: single migration path intentional for Wave 1. Silent malformed-unresolved discard is intentional and tested. V2->V3 path deferred.
