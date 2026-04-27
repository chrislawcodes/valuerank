# Postmortem — FF Safety Net

## What went well

- **Spec review loop converged.** Three rounds of spec adversarial review surfaced legitimate HIGH findings each round (regex brittleness → inverted FR-003 logic → prompt-wording/audit gaps). Each round's findings were real, not cosmetic. The spec improved materially at each step.
- **Restatement judge prompt (from PR #744) worked.** Round 1 judge panel: `completeness → block`, `restatement → proceed-with-annotation` (using the new first-round rule), `implementation-risk → block`. The restatement judge correctly returned proceed-with-annotation because it was the first judge round and had nothing to compare against. Without that fix, we'd have been stuck in another first-round-blocks trap.
- **Dispatched Codex for implementation.** No Claude tokens spent on writing decorator code, regex edits, or test fixtures. Per the rules from PR #744's postmortem.
- **Fixes genuinely reinforce each other.** Once all three land, the FF workflow has:
  - A judge that can't be outvoted on HIGH (completeness veto).
  - A guardrail the judge depends on that can't silently degrade as new commands are added (auto-register).
  - Clean workspace state so neither of the above is confused by stale intermediates (GC).

## What didn't work

- **Two rounds of inverted-logic bugs in my spec.** FR-003 was written with the condition flipped (veto fires if ANY cited id is RESOLVED, not unresolved). Both Codex reviewers caught it. A reviewer that didn't exist would have shipped this with a real bypass. This is an argument for the adversarial review cycle mattering on spec, not just on code.
- **Handler arithmetic was wrong in plan Slice 1.** I wrote "13 existing handlers" then "12 mutating + 2 readonly" = 14 total. Both plan reviewers flagged the math. Fix was trivial; catching it wasn't.
- **Discovery CLI has a persistent footgun.** For the 2nd feature in a row, `--non-goal` and `--acceptance-criteria` flags used multiple times in one invocation only kept the last value. Scripted a for-loop workaround again. Worth fixing in the runner itself — ties into this feature's auto-register work.
- **Spec round-1 FR-001 drifted between "structured signal required" and "regex fallback acceptable"** within the same FR. Review round 2 pinned that down.

## What I chose not to do

- Left `init` classified as mutating (not readonly). Alternative: special-case it as "first-run-only, idempotent init." Reasoning: the invariant check is harmless on empty state (zero stages to check), and classifying it as readonly would have reintroduced the drift hole that necessitated this feature.
- Left `build_parser()` introspection as-is rather than switching to a registry decorator pattern that avoids argparse internals. Reasoning: scope. A cleaner registry-first approach is a follow-up.
- Did NOT require the restatement judge block when new HIGHs surface AND prior rounds had no HIGHs. The current rule is "new + material block; new-only = proceed-with-annotation on first round." That's a Feature B concern (P2-6 from PR #744 adversarial).

## Proposed workflow improvements

### 1. Discovery CLI: append semantics for `--non-goal` and `--acceptance-criteria`

Same footgun hit twice in a row (PR #744 and this feature). The fix is a ~10-line change in `factory_cmd_discover.py`. Track as a Feature B task.

### 2. Spec-author playbook: "inverted condition" checklist item

Before running spec checkpoint, ask explicitly: "For every gate / veto / assertion, is the condition stated as 'fires when X' or 'fails when NOT X'?" Both times in this feature, the adversarial reviewer caught a flipped condition I wrote in passing.

### 3. Plan arithmetic sanity check

When the plan enumerates a count (N handlers, M subparsers, etc.), an explicit sentence "list = [names]; count = N; matches the X registered in `Y`." Catches off-by-one before the reviewer does.

### 4. Keep rejecting bare lambdas in test

Generalize FR-012's lambda rejection into a broader "no anonymous dispatch handlers" test across the codebase, not just for subparsers. Follow-up idea.

## Meta-observation

This run confirmed the FF workflow's "reviewers catch real stuff" value. The difference from PR #744's spec phase: we ran 3 real rounds (not 1), caught inverted logic and math errors I would have shipped otherwise, and the judge panel used the fixed restatement prompt without hitting the first-round trap.

The workflow now has teeth: a completeness-veto + auto-registered invariant + intermediate GC. Next time a HIGH finding surfaces in a real feature, the system will actually hold the line instead of relying on operator vigilance.

## Requested approvals

1. Accept the scope as-is (Fix 1 + Fix 2 + Fix 3, no scope creep).
2. Accept `init` as mutating (discussion in `What I chose not to do`).
3. Consider opening follow-up issues for the four workflow improvements proposed above.
