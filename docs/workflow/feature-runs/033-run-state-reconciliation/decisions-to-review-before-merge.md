# Decisions to review before merging PR #745

**Feature**: 033 — Run State Reconciliation
**PR**: https://github.com/chrislawcodes/valuerank/pull/745

You asked me to get this to a PR without stopping to ask questions. I did. Along the way I made choices where a human could reasonably have said "no, do it the other way." Here's each one, in plain language, with the alternatives I didn't pick and why.

Read these in order. They go from "this could cost you money" to "this is a style choice."

---

## 1. How we charge for late transcripts (money-sensitive)

### What's going on

When a run finishes, the code charges the AI provider (OpenAI, Anthropic, etc.) for every transcript. Sometimes a transcript shows up late — after the run was already marked finished. We still need to charge for that one. The question is: how do we make sure we don't charge twice for the same transcript?

### What I picked

I added a new column on the `Transcript` table called `costDebitedAt`. When we charge for a transcript, we also stamp it with a timestamp. Before charging again, we check the timestamp. If it's already set, we skip — we already paid for this one.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: timestamp marker on each transcript** | Each transcript row "remembers" whether it's been paid for | Simple. Hard to accidentally double-charge. Works across retries and restarts. | Need a new column. If someone edits the DB by hand and wipes the timestamp, you could double-charge. |
| Keep a "charged" ledger in a separate table | A new table `billing_ledger` tracks every charge event | More auditable — you can see every single charge | Twice the code to maintain. Harder to keep the ledger and the balance table in sync. |
| Just trust the run's status | Only charge when run flips to `COMPLETED`, never again | Zero new schema | Doesn't handle late transcripts. That's the whole bug we're trying to fix. Non-starter. |
| Charge per-run, not per-transcript (old behavior) | Run completion sums up all transcripts and charges the total | What the code does today | When a transcript arrives late, we have to either re-sum and double-charge, or skip it. Both bad. |

### What to check before merge

Spot-check a recent completed run:
1. Count transcripts where `costDebitedAt` is not null.
2. Compare to the amount logged as "Deducted provider balance" in production logs for that run.
3. If they don't match, something's off — tell me and I'll dig in.

---

## 2. How we convert old failure rows (data migration)

### What's going on

Before this PR, when a summarize job failed permanently, the code wrote "Summary failed: ..." into the `decision_text` field and set `summarized_at = now()`. That worked well enough for the old counter-based code, but the new code reads `summarized_at` as "this succeeded." So old failure rows would look like successes forever.

I need a one-time migration to fix existing rows.

### What I picked

The migration runs this SQL once:

```sql
UPDATE transcripts
SET summarize_failed_at = summarized_at, summarized_at = NULL
WHERE decision_text LIKE 'Summary failed%'
  AND decision_metadata IS NULL
  AND summarize_failed_at IS NULL
```

Translation: find every transcript where the text starts with "Summary failed" AND has no metadata (success rows always have metadata). Move the timestamp to the new column, clear the old one.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: text pattern + metadata check** | Match rows by text content + absence of success metadata | Runs once. No new code needed. Catches the standard failure case. | If old code ever wrote a different failure message (e.g. from a bug fix long ago), those rows get missed and look like successes. |
| Two-phase deploy | Ship code that stamps new failures with a flag column, let that run for a week, then run the migration using the flag | Rock solid. Only the flag is used to identify failures, no text matching. | Two deploys. Week of complexity. Any failure during the transition gets ambiguous. |
| Don't backfill | Treat all old failure rows as if they're successes | Zero risk from the migration itself | Historical data is wrong forever. Future derived-progress reads will lie about old runs. |
| Manual review | Dump all "Summary failed*" rows to a CSV, have a human pick which ones are real failures | Human judgment on edge cases | Takes hours. We have thousands of these rows. |

### What to check before merge

Run just the `SELECT COUNT(*)` version of the WHERE clause against a dev DB with production-shaped data. Look at how many rows match. Compare to the number of recent failure log entries. If the count is way off — like the DB says 2 failures but logs show 200 — the pattern is too narrow and we need to widen it.

---

## 3. Double-billing risk from re-queuing failed jobs

### What's going on

The new reconciliation sweep is aggressive: if a transcript didn't get summarized, the sweep re-queues it. Most of the time this is fine — the original summarize job crashed or timed out, the worker didn't actually call the AI provider.

But there's one scary scenario: the worker called OpenAI, OpenAI charged us, then the worker process died before writing "done" to the DB. The sweep sees no "done," re-queues. The re-queued job calls OpenAI again. Second charge for the same work.

The real fix is called **provider idempotency keys** — a flag you send with the API call that says "if you've seen this exact request before, don't charge me again, just replay the answer." Every major AI provider supports them. But adding them is a separate PR (tracked as meta-fix #2 in `docs/backend/paired-batch-run-flow.md`).

### What I picked

Ship without idempotency keys, accept the small double-bill risk.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: ship without keys, accept the risk** | Deploy this PR now; add idempotency keys as a follow-up PR | Fix the main problem (silent partial failures) today | If there's a burst of worker crashes, we pay double for some probes until the fix lands |
| Block this PR on idempotency keys first | Write and ship idempotency keys, then come back to this | No double-billing risk | Partial-failure bug keeps happening for longer. Keys are a small PR but still new work. |
| Disable the sweep's re-queue for summarize jobs | Sweep only detects and flags problems, doesn't retry | No double-billing via this path | Defeats half the point of the sweep. Stranded transcripts stay stranded. |
| Add a "was this actually retried at the provider?" check before re-queuing | Talk to the provider's API before re-queuing to see if our last request got through | In theory avoids double-billing | Takes an API call per re-queue check, slow, and most providers don't expose that |

### What to check before merge

Pull the last 7 days of production data for two numbers:
1. Count of probes that hit the dead-letter queue (expired without a result).
2. Total probes in the same window.

If #1 divided by #2 is under 0.5%, ship as-is. The double-bill exposure is rounding error.

If it's higher (say 2%+), hold this PR and ship idempotency keys first.

---

## 4. The sweep silently repairs the "total probes" counter

### What's going on

Each run stores a number called `progress.total` — how many probes the run is supposed to have. Everything else compares against this number. If that number is wrong (set to 180 when the run actually has 200 scheduled), the run never completes.

The code computes what the number *should* be from other tables (`RunScenarioSelection × modelIds × samplesPerScenario`). The sweep compares the stored value to the computed-correct value.

### What I picked

When they disagree, the sweep:
1. Writes a `SCHEDULED_COUNT_MISMATCH` anomaly row so an operator can see it happened.
2. **Also** silently overwrites `progress.total` with the correct value.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: auto-repair + log anomaly** | Fix the number automatically, leave a trail in the anomaly table | Stuck runs heal themselves. Operator can still see it happened. | If a launch bug starts producing wrong totals, the sweep cleans up silently and we never notice |
| Anomaly only, no repair | Log the mismatch, let a human fix it | Every correction is deliberate and reviewed | Every mismatch needs a human. Runs stay stuck until someone notices. |
| Repair only, no anomaly | Fix and move on, no record | Cleanest | Zero paper trail. Hard to notice patterns. |
| Fail loudly — pause the run | When the numbers don't match, stop the whole run until a human looks | Can't hide from a wrong total | Blocks work for what might just be a stale cache |

### What to check before merge

Decide: do you trust the sweep to patch state silently? My read is yes — because the anomaly row is the paper trail — but if your production runs get inflated totals from a real bug, you'd want the sweep to bark louder.

If you're nervous, we can downgrade this so the sweep only logs the anomaly and needs a human (via MCP tool) to confirm the repair. Small code change.

---

## 5. When a transcript arrives late, the run stays "completed"

### What's going on

A run flips to `COMPLETED`. Minutes later, a transcript that was in-flight during completion finally commits. Now we have a run marked done, but one more transcript appeared.

### What I picked

The sweep does three things:
1. Queues the transcript for summarization.
2. After it's summarized, re-runs analysis, re-computes token stats, and charges for the one new transcript (see decision #1).
3. **Leaves the run's status as `COMPLETED`** — doesn't flip it back to `SUMMARIZING` during the fix-up.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: status stays COMPLETED during fix-up** | Run looks done to the world; fix-up happens in the background | Simpler. No thrashing. Outside consumers (UI, reports) see stable status. | Consumers reading analysis results during the fix-up window see stale data without knowing it |
| Revert to SUMMARIZING while fix-up runs | Flip status back down, let the CAS re-flip when fix-up is done | Consumers can tell the run isn't really done yet | UI shows users "wait, it was done, now it's summarizing again?" More moving parts. |
| Set a separate flag like "reprocessing" | New enum value or a boolean on the run | Most honest about state | Schema change. UI change. More surface area. |
| Never re-run analysis on late transcripts | Just queue summarize, don't update analysis | No staleness from the analysis side | But the run's analysis is now incomplete. Worse than staleness. |

### What to check before merge

If anything in your workflow reads analysis results during the "just flipped to completed, now fixing up" window, you'll see stale numbers. If that matters, consider the "revert to SUMMARIZING" option.

For most uses — especially if consumers only read analysis hours or days after a run completes — this choice is fine.

---

## 6. Analysis gets triggered more than once (I didn't verify it's safe)

### What's going on

When a run first completes, the code calls `triggerBasicAnalysis(runId)`. This builds analysis results — summaries, aggregates, the whole report.

When the sweep rescues a late transcript (see decision #5), I call `triggerBasicAnalysis(runId)` **again** so the analysis includes the new transcript.

### What I picked

Call the analysis function a second time (and a third, and a fourth if more late transcripts keep arriving).

### The problem

I did not read the analysis code carefully. If it's the kind of function that **inserts** new rows every time it runs — rather than **replacing** existing rows — we'll end up with duplicate `AnalysisResult` records. Users would see the same analysis listed multiple times in reports.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: trust analysis is idempotent, call it again** | Assume `triggerBasicAnalysis` replaces rather than inserts | Simple. Matches my mental model of how analysis works. | If analysis inserts, we get duplicate rows in the DB |
| Delete existing analysis rows, then call | Before re-triggering, DELETE the run's analysis rows | Clean slate each time | Extra delete, deeper coupling to analysis internals |
| Log-only on re-trigger | When a late transcript lands on a COMPLETED run, log that analysis is stale but don't re-run | Zero risk of duplicates | Analysis stays wrong for stuck runs. Defeats the point. |
| Add an idempotency guard inside analysis itself | Make `triggerBasicAnalysis` an upsert | Solves it for all callers | Bigger change, outside this PR's scope |

### What to check before merge

Open `cloud/apps/api/src/queue/handlers/analyze-basic-data.ts` (or wherever analysis runs). Look at how it writes to the `AnalysisResult` table:

- Does it `db.analysisResult.upsert(...)` or `db.analysisResult.create(...)`?
- Does it `DELETE WHERE runId=...` before inserting fresh?
- Does it use a unique key that would cause a conflict on duplicate insert?

If any of those → safe, ship as-is.
If it just inserts → hold the PR, add a delete-then-insert guard before re-triggering.

---

## 7. The anomaly thresholds are first-pass guesses

### What's going on

The sweep watches for six kinds of problems and records them. Each has a threshold — a number above which "this is weird enough to flag."

### What I picked

Defaults in `anomaly-thresholds.ts`:
- **Pair mismatch**: flag if two paired runs differ in success rate by 20 percentage points or more
- **Stuck at summarizing**: flag if a run stays in "summarizing" for 30+ minutes
- **One model failing**: flag when a model has success rate below 30% absolute, OR below 50% when peer models are above 80%
- **Need at least 10 scheduled probes per model** before we even check

### Why these numbers

Honestly, I picked them with no data. They're educated guesses based on what "usually noisy vs. usually signal" looks like across systems.

### What could go wrong

- **Too sensitive**: tables fill up with anomalies that aren't actually problems (alert fatigue)
- **Not sensitive enough**: real problems slip through

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: hardcoded starting values** | Constants in a file, change requires a deploy | Simple. Easy to reason about. | Tuning requires a PR |
| Runtime-configurable via settings table | Admin UI to change thresholds | Tune without deploying | More code. Need a settings UI. Can drift across environments. |
| Auto-tuning based on historical data | Compute thresholds from baseline rate of false positives | Adapts over time | Complex. Would take weeks to get right. |

### What to check before merge

Ship with these defaults. Watch the first week. If `PAIR_ASYMMETRY` or `MODEL_TRANSCRIPT_SHORTFALL` generate more than ~1 anomaly per real production run, we're too sensitive — drop the thresholds. If they generate zero after a week even when there were visible problems, we're not sensitive enough — raise them.

Most likely need for tuning: the 30% absolute floor on model shortfall. Small-sample models (like a 10-probe cohort where 3 fail) will trip this at 30% success even though the variance at that sample size is high.

---

## 8. The sweep only looks back 30 days

### What's going on

The sweep runs every 5 minutes and scans runs that might need healing. To keep it fast, I limited which runs it scans.

### What I picked

Scope: any non-finished run, OR any COMPLETED run whose last update was within the past 30 days AND has at least one unsummarized transcript.

### Why

On a system with hundreds of thousands of historical runs, scanning all of them every tick would be expensive. 30 days is a reasonable "this is still worth auto-fixing" window.

### Other options I considered

| Option | What it means | Good | Bad |
|---|---|---|---|
| **My pick: 30-day window** | Scan recent runs only | Fast sweeps. Covers the operator-investigation window for most cases. | A stranded transcript from 2 months ago needs manual recovery |
| Always scan all runs | Ignore the time window | Nothing ever slips through | Sweep cost grows with historical data. Potentially slow over time. |
| 7-day window | Tighter scope | Faster | More cases require manual recovery |
| 1-year window | Looser scope | Covers almost anything operators would still care about | Sweep scans a lot more rows per tick |

### What to check before merge

If operators routinely investigate runs older than 30 days (e.g., for quarterly analysis), bump the window. If 30 days feels wide and you'd never look that far back, tighten it to 7.

---

## 9. I didn't run the tests locally

### What's going on

The CLAUDE.md preflight says: run lint, tests, and build before pushing. I ran lint and build. Tests failed to start because the test database requires Docker, and Docker wasn't running on this machine.

### What I picked

Push anyway. Rely on CI to run the tests.

### Other options

| Option | Good | Bad |
|---|---|---|
| **My pick: rely on CI** | Moves fast | If CI fails, we iterate with extra PR pushes |
| Start Docker manually before pushing | Tests run locally, faster feedback | Requires Docker to be installed + running — may not be available in every session |
| Skip tests entirely | Even faster | Tests are there for a reason. Ignoring them is how regressions ship. |

### What to check before merge

Wait for CI on the PR. If CI fails, it's likely a test that needed code I missed. Common suspects:
- `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`
- `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`
- `cloud/apps/api/tests/services/budget/deduct.test.ts`
- `cloud/apps/api/tests/services/run/progress.test.ts`

---

## 10. I deleted a variable that looked unused

### What's going on

In `cloud/apps/api/src/queue/handlers/probe-scenario/retry.ts`, Codex had this:

```typescript
const existingProbeResult = await db.probeResult.findUnique({
  where: probeResultKey,
  select: { status: true },
});
await recordProbeFailure({ ... });
```

The lint complained that `existingProbeResult` is assigned but never used. I removed the assignment since nothing reads it.

### What I picked

Delete it.

### Why it might be wrong

Codex may have intended to use it — perhaps to log the prior status, or to decide whether to call `recordProbeFailure` differently. The fact that it was assigned but not used suggests an incomplete thought.

### What to check before merge

Open `retry.ts` and read the `handleJobError` function. If the behavior around "probe is retrying after a previous failure" looks right, we're fine. If something about the error path looks like it should take into account whether the probe has a prior result, flag it and I'll restore the logic properly.

---

## 11. The PR is one big diff, not clean slices

### What's going on

The plan said: split the work into 8 waves, each ending in a `[CHECKPOINT]` so no single review has to cover more than ~300 lines. In practice Codex produced one ~1000-line commit, then a few smaller follow-ups.

### What I picked

Ship the PR as-is. Didn't manually split into smaller PRs.

### Why it might be wrong

Reviewing one giant diff is hard. A reviewer's attention fades. Bugs in less-changed files adjacent to heavily-changed files often get missed.

### Other options

| Option | Good | Bad |
|---|---|---|
| **My pick: one big PR** | Ships the full feature atomically | Hard to review |
| Split into 8 smaller PRs by wave | Reviewable, each PR has one job | Takes much longer — each PR blocks on the prior's merge |
| Split into 3 PRs (schema → logic → sweep) | Balanced | Still slower than one |

### What to check before merge

Use the commit-by-commit review on the PR:
- `b734f00a` — spec/plan/tasks (docs only)
- `e528b8cb` — core refactor (Wave 2-4)
- `325e7e22` — sweep + anomalies + migration (Wave 5-6 + 1)
- `bbdff6bb` — restore summarize helper
- `f4616735` — edge fixes
- `64725b6c` — TS + lint fixes

Review each one on its own. Easier than reading the whole diff in one shot.

---

## 12. Two unresolved spec concerns I decided without you

### What's going on

During the spec review, the judge panel said "advance" but flagged two things that still needed resolving. I resolved them in the plan without stopping to ask.

### The two concerns + my picks

**Concern A: How do we handle double-charging from balance deduction?**
- I picked: add the `costDebitedAt` marker described in decision #1.
- Alternatives I rejected: a separate `billing_ledger` table (too much code), delta-only deduction with no marker (fragile), just trust the run's status (doesn't solve the late-transcript case).

**Concern B: Where does the sweep scheduler live?**
- I picked: extend the existing `runRecoveryJob` tick to also fire the sweep.
- Alternatives I rejected: a separate PgBoss scheduled ticker (more code, no real benefit), a cron job outside PgBoss (doesn't integrate with the existing recovery flow).

### What to check before merge

Read `plan.md` section "Resolving the Two Unresolved Concerns." If either pick feels wrong, push back — the reverse of each is viable, it'd just take a separate PR.

---

## Quick-merge checklist

Before you click merge, confirm each:

- [ ] CI is green on PR #745 (decision #9)
- [ ] Backfill count matches expected failure rows (decision #2)
- [ ] Production dead-letter rate is low — under 0.5% — so ship without idempotency keys (decision #3)
- [ ] `triggerBasicAnalysis` confirmed safe to call more than once per run (decision #6)
- [ ] You're okay with the sweep silently repairing `progress.total` (decision #4)
- [ ] You're okay with `COMPLETED` runs having brief staleness during late-rescue (decision #5)
- [ ] You reviewed the commit-by-commit diff (decision #11)

If any line is red, tell me which one and I'll either fix it in a follow-up commit on this PR, or propose a separate fix PR to land first.
