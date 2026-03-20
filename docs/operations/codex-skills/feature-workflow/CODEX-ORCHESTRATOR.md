# Codex Orchestrator Guide

This guide tells you — Codex — exactly how to run the feature workflow when Claude is not available. Read this before starting any workflow as the Codex Orchestrator.

For the authoritative phase table (what happens at each stage), see `SKILL.md` in this directory. This guide covers the operational details: commands, models, escalation, and handoff.

---

## 1. When This Guide Applies

You are in **Codex Orchestrator** mode when:
- A human says "use feature workflow to implement X" from a Codex session
- Claude has handed off mid-workflow via a `block` note in `workflow.json`
- The workflow `status` shows a `blocked-state: active` with a reason that starts with "Claude session ended"

In Codex Orchestrator mode, **you drive the workflow end-to-end**. You write artifacts, call the runner, call Gemini for reviews and research, judge findings where you can, and escalate to the human where you cannot.

---

## 2. Models

| Task | Model | Flag |
|------|-------|------|
| All Codex implementation and review tasks | `codex-5.4-mini` | `-m codex-5.4-mini` |
| All Gemini review and research tasks | `gemini-2.5-pro` | `-m gemini-2.5-pro` |

**Gemini calls must be serial.** Do not launch multiple Gemini CLI calls concurrently in the same session. The runner enforces this via a concurrency lock in `run_gemini_review.py`. If you call Gemini directly (outside the runner), call it one at a time. Parallel Gemini calls cause rate limit failures.

---

## 3. Phase-by-Phase Command Reference

All runner commands run from the repo root:

```bash
python3 docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py <command> --slug <slug>
```

| Phase | What you do | Runner command |
|-------|-------------|----------------|
| **Check status** | Always start here — read current state | `status --slug <slug>` |
| **Discovery** | Ask clarifying questions one at a time; record assumptions | `discover --slug <slug> --complete --summary "<summary>"` |
| **Write spec** | Research real file paths via Gemini, author `spec.md` | Write to `docs/workflows/<slug>/spec.md`, then checkpoint |
| **Spec checkpoint** | Generate adversarial reviews, judge findings | `checkpoint --slug <slug> --stage spec` |
| **Write plan** | Author `plan.md` with architecture decisions | Write to `docs/workflows/<slug>/plan.md`, then checkpoint |
| **Plan checkpoint** | Generate adversarial reviews, judge findings | `checkpoint --slug <slug> --stage plan` |
| **Write tasks** | Author `tasks.md` with `[CHECKPOINT]` markers at slice boundaries | Write to `docs/workflows/<slug>/tasks.md`, then checkpoint |
| **Tasks checkpoint** | Generate adversarial reviews, judge findings | `checkpoint --slug <slug> --stage tasks` |
| **Implementation** | Implement one slice, run build + tests, commit | `codex exec -s workspace-write "..."` |
| **Diff checkpoint** | Generate adversarial reviews of the diff, judge findings | `checkpoint --slug <slug> --stage diff` |
| **Deliver** | Stage the PR for human approval | `deliver --slug <slug> --dry-run` then notify human |
| **Closeout** | Write closeout summary | Write to `docs/workflows/<slug>/closeout.md`, then checkpoint |
| **Closeout checkpoint** | Final adversarial review | `checkpoint --slug <slug> --stage closeout` |
| **Reconcile a review** | Record your judgment on a review finding | `reconcile --slug <slug> --review <path> --status <accepted\|rejected\|deferred> --note "<judgment>"` |
| **Block on a decision** | Escalate to human | `block --slug <slug> --reason "<specific decision needed>"` |
| **Repair stale reviews** | Re-run stale reviews after artifact edits | `repair --slug <slug>` |

---

## 4. Escalation Protocol

### Codex can judge and reconcile:
- Findings that are clearly out of scope for the current slice
- Findings that duplicate something already addressed in the artifact
- Findings that conflict with an explicit decision recorded in the spec or plan
- Low/medium severity findings with an obvious deferral justification

### Codex must escalate to human via `block`:
- Architectural decisions not covered by the existing spec or plan (schema changes, new job types, new external dependencies)
- Conflicting findings from Codex attack and Gemini review that point in opposite directions
- Implementation failures that persist after 3 fix attempts
- Anything that would affect production data, credentials, or deployment configuration
- Any finding where you are genuinely uncertain whether to accept or reject

When escalating:
```bash
python3 docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py \
  block --slug <slug> --reason "<specific decision needed — not just 'blocked'"
```

Be specific. "Gemini flagged X as a security risk but spec explicitly scopes it out — confirm deferral is correct" is useful. "Something went wrong" is not.

---

## 5. What You Must Not Do Without Human Approval

- `git push` or `git push --force`
- `git merge` into main or any protected branch
- `gh pr create` — stage with `--dry-run`, notify human, wait for explicit approval
- Any database migration on production
- Any change to credentials, secrets, or deployment configuration

If any runner command would trigger one of these, stop and block first.

---

## 6. Command Failure Protocol

1. If a runner command fails, retry it once
2. If it fails a second time, run:
   ```bash
   block --slug <slug> --reason "<command> failed after 2 attempts: <error summary>"
   ```
3. Stop. Do not silently continue past a failed gate.

Do not suppress errors or attempt workarounds that bypass the workflow steps. The failure is information — record it and let the human decide.

---

## 7. Handoff Back to Claude

When your session is ending or you have reached a natural stopping point:

**Step 1:** Check current state:
```bash
python3 docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py \
  status --slug <slug>
```

**Step 2:** Record state for Claude:
```bash
python3 docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py \
  block --slug <slug> \
  --reason "Codex session ending at <current phase>. Open decisions: <list any unresolved findings or escalated decisions>. Last completed: <last successfully checkpointed stage>."
```

The `block` command writes to `workflow.json` — this is the handoff artifact. When Claude returns, it reads `status --slug <slug>` and sees the block reason, then clears the block after reviewing the open decisions.

**What to include in the block reason:**
- Current phase (e.g., "tasks checkpoint complete, ready for implementation")
- Any active escalations or unresolved review findings
- Any decisions made during the session that weren't in the original spec/plan
- Anything Claude needs to know before continuing
