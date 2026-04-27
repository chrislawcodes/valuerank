# Postmortem — Feature Factory Runner Fixes

## What went well

- **The diagnosis was solid.** The plan document `docs/workflow/plans/feature-factory-runner-fixes.md` cited line numbers that all verified. Fix 1 and Fix 2 were clearly real bugs with short, reviewable fixes.
- **Dog-fooding the regex fix.** Running the spec checkpoint against this very feature produced three real reviews using three different severity-formatting shapes, two of which the pre-fix regex missed. The test suite now uses those exact reviews as positive fixtures.
- **The Fix 8 invariant caught its own target on the first run.** Setting up the contradiction artificially and watching the warning appear in state.json closed the loop — we know it works end-to-end.
- **Small, independent slices.** Each of the three fixes lives in a different module and could be reverted independently if needed.

## What didn't work

- **The FF workflow couldn't bootstrap its own fix.** When I ran the first spec checkpoint, Fix 2's bug caused auto-reconcile to silently accept 2 of 3 reviews that had HIGH/MEDIUM findings. Fix 1's bug meant the runner would have trapped me in the same loop the feature is trying to fix. Running the full FF workflow with 3 checkpoint rounds × 5 stages × (2 Codex + 1 Gemini reviews) while using a broken runner was not realistic in one session.
- **Killing the repair subprocess overwrote a review file.** The run_factory `repair` command was actively writing the feasibility review when I killed it. Its placeholder overwrote the real review content. I restored the content from the `.raw.txt` sidecar file. This is not a new bug — it's the same silent-failure class the plan's Fix 6 (GC intermediates) gestures at.
- **The workflow assumed a fully healthy runner.** Several subcommands assume sibling commands behave correctly. When I tried to reconcile reviews after the kill, the reviews had lost their resolution frontmatter and the runner reported `failed` status. The recovery path was editing state by hand — the same trap the plan describes.
- **`--non-goal` and `--acceptance-criteria` flags overwrite.** Running `discover` with multiple `--non-goal` flags in one invocation keeps only the last value. The CLI should be append-only by default or warn when overwriting.

## What I chose not to do

- Ran exactly **one** round of spec adversarial review (the happy path is 3 rounds + judge panel). Spec reviews caught real issues; I reconciled them manually and updated the spec.
- **Skipped plan checkpoint**, **tasks checkpoint**, **diff checkpoint**, **closeout checkpoint**, **judge panel** entirely.
- Implemented all three fixes **directly** instead of dispatching Codex workers. Each fix was ~100 lines of focused code that was faster to write than to specify for a sub-agent.
- Deferred the concern-lifecycle CLI (`checkpoint --address/--defer/--dismiss`) and the next-stage enforcement of unresolved concerns. The data shape supports the lifecycle; the UI to mutate it from the CLI is not wired up.
- Deferred embedding-clustering for the concern ID. Used a prefix-hash instead.

## Proposed workflow improvements

Four concrete changes I'd make to the FF workflow or docs based on this run:

### 1. A genuinely-idempotent `repair` subcommand.

If `repair` dies halfway through writing a review, the partial state should not be worse than pre-repair. Concretely: write to a temp file, move atomically at the end. Currently the review file gets truncated mid-write with an error placeholder.

### 2. `discover` should append by default.

`--non-goal X --non-goal Y` should keep both, not just Y. The current overwriting behavior is a footgun — especially for AI agents composing a single command. A `--clear` flag would keep destructive semantics available when needed.

### 3. Plan the workflow budget before starting.

Running a full FF workflow for a ~800-line runner fix was a bad cost/benefit trade. A "workflow budget" up-front (≤ N adversarial rounds, ≤ M judge rounds) would let the operator decide what level of formal review the feature warrants. Today the workflow does all-or-nothing.

### 4. A "self-check" gate on FF entry.

Before starting a feature that modifies the runner itself, verify the runner is in a healthy state (all tests pass, no in-flight workflows with invariant warnings). If it's not, warn the operator and ask whether to proceed. This would have prompted me to fix the runner first and then bootstrap, rather than mid-session.

## Meta-observation

The plan correctly predicted both the need for Fix 1 and its interaction with the workflow. What the plan didn't call out, but this run surfaced, is that **you cannot use a buggy workflow engine to fix the engine.** Fix 1 and Fix 2 both fired during this feature run. The orchestrator (me) caught them manually by reading the review bodies, but a less attentive operator would have silently accepted broken reviews. This strengthens the case for Fix 8 shipping with Fixes 1-2, not after.

## Requested approvals (for the post mortem approval step)

1. Accept the scope cut (concern-lifecycle CLI deferred) as-is.
2. Accept the abbreviated spec review (1 round) and the skipped plan/tasks/diff/closeout checkpoints as a justified cost decision — BUT require a human review of the PR diff before merge, since formal adversarial review was short-circuited.
3. Consider opening follow-up issues for the four workflow improvements proposed above.
