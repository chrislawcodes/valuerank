---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/plan.md"
artifact_sha256: "3ab646a54a85269378ab2bdcbc0e751b03773aeb35771ab86fb8de476685ecc3"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state."
raw_output_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **High: The plan’s identity model is too fragile for enforcement.**  
   Making the canonical identity a normalized item text in `unresolved[]` creates collision risk and false merges. Two distinct discovery items can normalize to the same string, and small normalization changes can make existing state unreadable or unresolvable. That is a weak foundation for a blocker system because `resolve`, `defer`, status, and checkpointing will all inherit the same ambiguity.

2. **High: The “grandfathered legacy blobs” rule can silently bypass the new blocker.**  
   The plan says old discovery blobs without explicit `unresolved[]` entries are grandfathered. That means the exact states most likely to need enforcement can still pass checkpointing with unresolved discovery debt. If the goal is to stop progress on unresolved discovery, this is a bypass, not a compatibility rule.

3. **High: There is no explicit conflict rule for items that are both unresolved and deferred.**  
   The plan says deferred items should be ignored by the blocker, but it does not define precedence when state becomes inconsistent, such as stale data containing the same item in both `unresolved[]` and the deferred set. Without a strict rule, status, next action, and checkpoint gating can disagree or flip-flop depending on helper order.

4. **Medium: The plan does not account for duplicate unresolved entries or normalization edge cases.**  
   If `unresolved[]` contains repeated items, extra whitespace, punctuation variants, or case variants, the helper may over-block, under-block, or resolve the wrong entry. This is especially risky because the plan relies on “the same normalized text comparison” everywhere, but does not define the normalization contract tightly enough to make behavior deterministic.

5. **Medium: The enforcement surface is incomplete as written.**  
   The outline mentions `discover`, spec checkpointing, `status`, and `recommended_next_action`, but not every transition that can mutate or consume discovery state. If any other command path can mark completion, clear state, or compute next steps without the same helper, the enforcement can drift immediately even if those four touchpoints are correct.

## Residual Risks

- Even with the helper in place, text-based identity will remain more error-prone than a stable item ID scheme, so accidental collisions or normalization drift can still create hard-to-debug behavior.
- The break-glass `discover --clear` path may leave users with a technically valid but semantically lossy state, so later diagnostics may be harder unless the destructive action is logged very clearly.
- If legacy states are not migrated, some existing workflows may continue to checkpoint despite unresolved discovery debt, which weakens the enforcement guarantee until cleanup is completed.
- Status and `recommended_next_action` can still become misleading if future commands are added without routing through the same blocker helper.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
