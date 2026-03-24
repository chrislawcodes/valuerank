---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/feature-workflow-discovery-shaping/spec.md"
artifact_sha256: "5f3308948f7b5df77c76fcf11a4108f6b7736989715151ab9200a0a6032bbc5e"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice."
raw_output_path: "docs/feature-runs/feature-workflow-discovery-shaping/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- High: The spec relies on the existing `state.json` schema, but it never defines how to distinguish legacy grandfathered discovery states from newly blocking unresolved items. Without an explicit versioning or discriminator rule, an implementation has no reliable way to know whether “no explicit unresolved entries” means “safe legacy state” or “corrupt/incomplete state,” so the blocking logic will either be too strict or too permissive.
- High: `discover --defer <item>` is underspecified because it does not define what an `<item>` is or how it is matched. If discovery items can be renamed, duplicated, reordered, or regenerated, deferral can become ambiguous and fragile across reloads, which makes the new enforcement easy to bypass or break.
- High: `discover --clear` is described as a break-glass recovery path, but the spec does not say exactly what state is cleared, what is preserved, or whether the operation is audited or guarded. That makes it easy to implement a destructive reset that violates the non-destructive requirement or silently wipes valid discovery debt.
- Medium: The spec uses both `recommended_next_action` and `next-action` without defining whether they are the same surface, aliases, or separate outputs. That creates a likely split-brain bug where one UI/path says `discover` while the other does not, and only one of them may get updated.
- Medium: The blocking rules are incomplete outside the named commands. The goal says unresolved items should prevent the workflow from moving forward automatically, but the spec only explicitly blocks `discover --complete` and `checkpoint --stage spec`. Any other forward-moving command or override path remains a likely bypass unless it is explicitly covered.
- Medium: The requirement that deferred items remain visible as non-blocking debt is not actually enforced by the acceptance criteria. A minimal implementation could hide deferred items from `status` and still satisfy the current checks as long as unresolved items block.

## Residual Risks

- Concurrency remains a risk: if discovery state changes between `status`, `discover`, and `checkpoint`, the spec does not require atomic checks or conflict handling.
- The grandfathering rule for legacy states may still hide bad historical data if the legacy shape is mixed or partially corrupted.
- If the existing schema cannot represent stable item identity plus deferred state cleanly, the implementation may need a compatibility shim that the spec does not currently define.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice.
