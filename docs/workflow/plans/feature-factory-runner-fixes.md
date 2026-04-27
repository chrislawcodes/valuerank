# Feature Factory Runner — Fixes Plan

**Author**: Session with Claude Opus 4.7, 2026-04-23
**Status**: Draft — based on investigation during feature run `033-run-state-reconciliation`
**Background**: Feature run 033 triggered a sequence of friction points in the FF runner where the workflow appeared to "pause for human input" despite the skill explicitly instructing not to. Investigation surfaced seven real issues in the runner scripts under `docs/workflow/operations/codex-skills/feature-factory/scripts/`.

---

## What happened during 033 (the symptom pattern)

During the spec phase of feature run 033:

1. Spec checkpoint passed (3 adversarial rounds). Next-action banner said `repair_plan_checkpoint` — sounded like an error, but really meant "now run plan checkpoint."
2. Auto-reconcile accepted 3 reviews as "no actionable findings" — but the reviews actually contained multiple HIGH findings. The orchestrator (Claude) caught it by reading the bodies; the runner did not.
3. After each spec edit addressing HIGH findings, re-running checkpoint triggered another adversarial round. On round 4, the runner correctly routed to `judge_panel` (3-round cap hit).
4. Judge panel round 2 voted 2 proceed / 1 block → state.json set `judge_next_action: "advance"`. But the runner's next-action banner still said `repair_spec_checkpoint`, not "advance to plan."
5. Judge panel round 3 exhausted. Output said `"judge panel exhausted; advancing with unresolved concerns"` AND `"→ next: repair_spec_checkpoint"` in the same output. Two signals disagreed.
6. `python3 run_factory.py repair --slug …` output `"repair: spec: repairing unhealthy-manifest → next: judge_panel - blocked: spec repair failed"` — a loop.

Orchestrator experience: the runner felt like it was blocking. Closer investigation (via a subagent with access to the runner source) showed the runner was **not** blocking — it was advising, but the advice was ambiguous or wrong.

---

## Root causes

### Cause 1 — `judge_next_action` is written but never read

[factory_cmd_judge.py:879, 884, 899](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py) sets `stages.spec.judge_next_action` to `"advance"`, `"edit_and_rerun_judge"`, etc. [factory_next_action.py:76-143](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_next_action.py) — the function that decides the runner's top advice — never reads that field. It bases its recommendation entirely on `stages[stage].healthy`, which is computed live from the manifest vs. disk SHA.

**Consequence**: even after judges formally vote `advance`, the runner keeps recommending `repair_spec_checkpoint` because the spec SHA has drifted.

### Cause 2 — SHA drift after judge voting creates a dead end

Every spec edit after the last `checkpoint` command changes the artifact SHA. The manifest locks the old SHA; the new SHA isn't in `adversarial_sha_history`. That marks the stage unhealthy. The natural response is to re-run `checkpoint`, but that's blocked by the [3-round adversarial cap in factory_cmd_checkpoint.py:131-136](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py). `repair` ends in `"blocked: spec repair failed"`. There's no CLI path forward except hand-editing state.json + review frontmatter SHAs.

### Cause 3 — Auto-reconcile's severity regex is too narrow

[factory_review_specs.py:20-27](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py) uses a regex that only matches two line shapes:
- `- high:` / `- medium:` (bullet with lowercase severity prefix)
- `| **HIGH** |` (table cell with bold uppercase)

Reviewer outputs that use any of these formats slip through undetected:
- `1. **HIGH**: The spec removes …` (numbered list, markdown heading style)
- `### HIGH: missing index` (heading-per-finding)
- `**HIGH [CODE-CONFIRMED]**: …` (prefix only)
- `Severity: HIGH` (inline field)

All of the reviews in run 033 used the first pattern. Auto-reconcile marked them "no actionable findings detected — auto-accepted" despite each one having 3–5 HIGH findings in the body.

### Cause 4 — Banner language is confusing

The state machine uses `repair_X_checkpoint` as the name for "this stage needs its checkpoint run." That word "repair" reads to a human (and to an orchestrating AI) as "something broke, fix it" — but mechanically it just means "run the checkpoint command for stage X." Every transition between stages surfaces a `repair_next_checkpoint` banner, making the workflow feel broken even on the happy path.

### Cause 5 — No force-advance flag

There is no `--force-advance`, `--skip-manifest-check`, or `--accept-judge-verdict` flag anywhere in the runner. The only escape hatches are:
- `judge --migration-bypass` — only bypasses the *floor* of the adversarial-round count, not the manifest health check
- `checkpoint --fallback` — reviewer fallback, unrelated
- `deliver --override-judges` — only at the deliver stage

### Cause 6 — 3-round cap traps post-edit workflows

Once `adversarial_rounds == 3`, no further checkpoint runs adversarial reviews (correct — that's the cap). But if the artifact is edited after cap (to address judge-flagged issues), the manifest becomes unhealthy and the runner advises `repair_spec_checkpoint`, which is the blocked path. The cap is enforced as `>= 3` with no way to say "this re-checkpoint is a no-op validation, not a new review round."

### Cause 7 — Review artifacts accumulate between runs

`reviews/*.narrowed.txt`, `reviews/*.narrowed.json`, `reviews/*.raw.txt` pile up across failed checkpoint attempts. Nothing garbage-collects them. A fresh run starts with stale files visible, and the orchestrator has to remember to `rm` them before re-running.

### Cause 8 (minor) — Default character budgets too tight

Default `--max-artifact-chars` and `--max-total-chars` truncate real specs. Run 033 needed `--max-artifact-chars 50000 --max-total-chars 250000` to avoid the "artifact too large" failure. A reasonable default would save an iteration.

---

## Proposed fixes

Ranked by payoff-vs-effort.

### Fix 1 — Honor `judge_next_action` in the decision tree (high payoff, small change)

In [factory_next_action.py:76-143](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_next_action.py), before the `stages[x].healthy` check, add:

```python
if stage.get("judge_next_action") == "advance":
    return next_stage_action(stage_name)
```

Carry `stages[stage].unresolved_concerns` forward for the next stage to address. Update the plan-stage checkpoint spec to require every unresolved concern from the prior stage to be addressed in `plan.md`.

### Fix 2 — Broaden auto-reconcile severity detection (high payoff, small change)

In [factory_review_specs.py:20-45](docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py), extend the regex to also match:
- `^\d+\.\s*\*\*(HIGH|MEDIUM)\*\*` (numbered list with bold severity)
- `^#+\s*(HIGH|MEDIUM)\b` (heading with severity)
- `^\s*\*\*(HIGH|MEDIUM)[\s:\[]` (bold severity prefix)
- `^\s*Severity:\s*(HIGH|MEDIUM)` (inline field)

Add a property-based test covering each shape. Separately, reject auto-accept when the review body contains any of these patterns — even if frontmatter claims "no findings."

### Fix 3 — Add `--force-advance` flag (medium payoff, small change)

New flag on `checkpoint` and `judge`:

```
python3 run_factory.py advance --slug <slug> --stage spec \
  --reason "<required: why we're skipping the manifest check>"
```

Internally: set `stages[stage].judge_next_action = "advance"` and record the reason in `annotations[]`. Combined with Fix 1, the runner then moves past the stage on its next evaluation.

### Fix 4 — Rename `repair_X_checkpoint` to `run_X_checkpoint` (low effort, UX win)

Pure string change. `repair` stays as a separate subcommand (for the actual manifest-repair case).

### Fix 5 — Allow validation re-checkpoints past the 3-round cap (medium payoff, medium change)

Add a `--validation-only` flag to `checkpoint` that skips running adversarial reviews (they're already at the cap) but re-runs manifest generation against the current artifact SHA. This gives a clean CLI path to resync the manifest after post-cap edits without opening a new adversarial round.

### Fix 6 — Garbage-collect stale review artifacts on checkpoint start (small change, UX win)

At the start of each `checkpoint --stage X` run, delete `reviews/X.*.narrowed.*`, `reviews/X.*.raw.*` unless `--keep-intermediates` is passed.

### Fix 7 — Raise default character budgets (trivial, UX win)

Change defaults to `--max-artifact-chars 40000`, `--max-context-chars 50000`, `--max-total-chars 200000`. Keep the flags for edge cases but reduce the number of manual retries.

### Fix 8 — Post-run self-check (medium effort, catches future regressions)

After every `checkpoint`, `judge`, `reconcile`, `auto-reconcile` command, run a cheap invariant check:
- If `judge_next_action == "advance"` and `recommended_next_action == "repair_<same stage>_checkpoint"`, log a WARN to the workflow state and print "⚠ state contradiction detected: judge says advance but manifest says repair — see feature-factory-runner-fixes.md".

This makes future occurrences of the 033-style trap visible immediately.

---

## Testing approach

1. **Unit** — the regex change (Fix 2) can be property-tested. The `factory_next_action` change (Fix 1) has a small decision surface and benefits from a table-driven test over the `stages[x]` shape.
2. **Integration** — replay run 033's state.json snapshot (preserved in git if the user wants) and assert the new runner advances past spec after the judge panel's `advance` verdict, carrying unresolved concerns forward.
3. **End-to-end smoke** — a tiny dummy feature with a 1-paragraph spec, full workflow, no human intervention. Should complete in under 15 minutes with the fixes in place.

---

## Scope boundary

Out of scope for this plan:
- Changes to `sync-codex-skills.py` or the `review-lens` scripts.
- Any change to reviewer prompts themselves.
- Product-surface changes (UI for anomalies, GraphQL shape, etc. — those belong to feature 033 or its successors).
- Switching away from PgBoss or away from the current scheduler model.

---

## Handoff prompt

Copy everything below into a fresh session. Tell the user to attach the session to a branch-specific worktree or the repo root.

````
You're picking up a fixes effort on the ValueRank Feature Factory runner. Full
context lives at docs/workflow/plans/feature-factory-runner-fixes.md — read it
first; it describes the 8 issues, proposed fixes, and test approach.

Your job:
1. Implement Fixes 1–4 (judge_next_action honored; broader severity regex;
   `advance` subcommand; banner renames) as a single PR on a feature branch
   named feat/ff-runner-judge-advance.
2. Add unit tests for each fix in scripts/tests/ if that directory exists; if
   not, follow the project's existing test conventions (look at how other
   runner scripts are tested — check scripts/ and docs/workflow/operations/).
3. Run the existing runner tests to confirm no regression.
4. Open the PR against chrislawcodes/valuerank.

Constraints:
- Active product lives in cloud/; runner scripts are Python under
  docs/workflow/operations/codex-skills/feature-factory/scripts/.
- Do not modify CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, MEMORY.md, .gitignore.
- Follow the project's agent contract in AGENTS.md and the cloud standards in
  cloud/CLAUDE.md.
- Preflight lint+test+build the runner changes before pushing.

Key evidence you should verify before coding:
- factory_next_action.py:76-143 (decision tree; needs the judge_next_action
  check added at the top)
- factory_review_specs.py:20-45 (regex to broaden)
- factory_cmd_judge.py:879, 884, 899 (where judge_next_action is currently
  written — don't break that)
- factory_cmd_checkpoint.py:131-136 (the 3-round cap, keep it but add
  --validation-only escape for Fix 5 when you get to it later)

Fixes 5–8 are NOT in this PR — they become follow-up issues. Write them up as
GitHub issues (gh issue create) with a link back to
docs/workflow/plans/feature-factory-runner-fixes.md for context.

Start by reading the plan doc end-to-end, then look at the four target files,
then ask me clarifying questions (one at a time, state the count upfront).
````

---

## Model recommendation

**Use Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7`.**

Rationale:
- This is a multi-file refactor of runtime-critical orchestration code. Opus 4.7 handles the judgment calls (e.g., how aggressively to broaden the regex, whether to preserve the `repair` subcommand name for actual repair cases) better than smaller models.
- The runner scripts span ~10 files, and the fix touches cross-cutting state (state.json schema, manifest, review frontmatter). The 1M context window lets a single session hold every file it needs.
- The cost premium vs. Sonnet is justified once — the orchestration code is load-bearing; a subtle bug here would be painful in the next real feature run.

If the user wants to parallelize: use Sonnet 4.6 (`claude-sonnet-4-6`) for Fixes 2, 4, 6, 7 (small, localized) and Opus for Fixes 1, 3, 5 (design-sensitive).
