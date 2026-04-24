# Paired Batch Run Flow — End to End

Trace of how a paired batch run for a domain goes from user click to summarized data, with every place it can partially fail silently.

Written 2026-04-23 during investigation into "why do so many batches have partial failures?"

All paths are relative to the repo root. Active product lives in `cloud/`.

---

## 1. Start: GraphQL mutation

**UI** calls `startDomainEvaluation`.

- Mutation: [cloud/apps/api/src/graphql/mutations/domain/evaluation.ts:48](cloud/apps/api/src/graphql/mutations/domain/evaluation.ts:48)
- Inputs: `domainId`, `scopeCategory` (PILOT / PRODUCTION / REPLICATION / VALIDATION), `temperature`, `maxBudgetUsd`, `definitionIds`, `modelIds`, `samplePercentage`, `samplesPerScenario`, `targetBatchCount`.

Resolver flow:
1. `launchDomainEvaluation()` at line 78.
2. Creates a `DomainEvaluation` row (status `PENDING`) at line 126.
3. Captures a config snapshot (line 132) — models, temperature, projected cost.
4. `executeLaunchRuns()` at line 155.
5. `recordLaunchResults()` at line 168.
6. Returns `{ successCount, failureCount }`.

Schema: [cloud/packages/db/prisma/schema.prisma:419](cloud/packages/db/prisma/schema.prisma:419) (`DomainEvaluation`) + `DomainEvaluationRun` join table linking each `Run` to the parent evaluation.

---

## 2. Pair grouping

Where "paired batch" actually gets set up.

- Orchestrator: [cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts:97](cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts:97)
- Calls `groupDefinitionsByPairKey()`. Pairs are identified by `pairKey` (asset token, e.g. `value_first` / `value_second`).
- **Incomplete pairs** (a definition has no companion): logged as a warning (line 98–103) but launched as a singleton run. The user is not told pairing failed.

Slot planning: [cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts:120](cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts:120)

When `group.pairKey !== null`:
- Generates a shared `jobChoiceBatchGroupId` (UUID) that both runs share.
- `jobChoiceLaunchMode: 'PAIRED_BATCH'` (line 127).
- Stores `jobChoiceValueFirst` token for later matching (line 129).
- `methodologySafe: true` (line 130).

All of this lives inside `Run.config` (JSON). There is no dedicated "pair" table. Pair status is reconstructed at analysis time.

---

## 3. Schema shape for the rest of the pipeline

- `Run`: [cloud/packages/db/prisma/schema.prisma:366](cloud/packages/db/prisma/schema.prisma:366)
  - `status`: `PENDING → RUNNING → SUMMARIZING → COMPLETED` (or `FAILED` / `CANCELLED` / `PAUSED`).
  - `progress`: `{ total, completed, failed }` for probes.
  - `summarizeProgress`: `{ total, completed, failed }` for transcript summaries.
- `Scenario`: schema.prisma:538 — child of Definition, holds the prompt.
- `ProbeResult`: schema.prisma:613 — unique on `(runId, scenarioId, modelId, sampleIndex)`. Tracks status (`SUCCESS | FAILED`), error code, error message, retry count.

---

## 4. Enqueue

- Entry: [cloud/apps/api/src/services/run/start-queue.ts:25](cloud/apps/api/src/services/run/start-queue.ts:25)
- `enqueueRunJobs()` routes jobs to provider-specific queues (openai, anthropic, etc.).
- Capped per provider: `PROBE_QUEUE_DEPTH_PER_PROVIDER = 15`.

**Failure point 1 — enqueue drops.**  If jobs fail to enqueue after the retry loop (line 122–144), the whole run is marked `FAILED` (start.ts:319). Only the first 10 failures are logged; the rest are silently dropped. No auto-recovery.

---

## 5. Probe execution

Handler: [cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:40](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:40)

Idempotency & recovery (lines 70–151):
- If probe already has a `SUCCESS` `ProbeResult` → skip.
- If probe has a `FAILED` `ProbeResult` with retryCount > 0 → skip, to avoid re-running terminal failures.
- If a transcript exists but no `ProbeResult` row → rebuild the `ProbeResult` from the transcript (line 111).
- Advisory lock around transcript insert (line 244) prevents dup transcripts.

Worker call (lines 153–291):
1. Shells out to Python `workers/probe.py` (line 173).
2. Python returns either `{ success: true, transcript: {...} }` or `{ success: false, error: { message, code, retryable, details } }`. See [cloud/workers/probe.py:35](cloud/workers/probe.py:35).

**Failure point 2 — non-retryable worker error.**  If `retryable: false` (bad prompt, validation error, auth error), handler calls `recordProbeFailure()` with `retryCount=0` and returns (line 206). No retry. Single probe stays `FAILED`. Batch continues.

**Failure point 3 — batch-level crash.**  The probe queue handler processes jobs in batches. If the Python process crashes (OOM, timeout), PgBoss requeues the entire batch (handler.ts:374). Successful probes from the first attempt are idempotently skipped. But **a probe that was marked `FAILED` on attempt 1 is also skipped on attempt 2** — its status is never reconsidered. Fail-once-and-you're-done.

**Failure point 4 — dead-letter.**  [cloud/apps/api/src/queue/handlers/probe-dead-letter.ts:26](cloud/apps/api/src/queue/handlers/probe-dead-letter.ts:26) — probe jobs that stay queued > 30 min go to dead-letter, which calls `recordProbeFailure()` with code `JOB_EXPIRED`. Progress silently increments `failed` by 1. No user notification.

After each probe, `applyProgressDelta()` bumps `completed` or `failed`. When `completed + failed >= total`, the run transitions to `SUMMARIZING`. Note: **there is no distinction between "all done clean" and "all done with failures."**

---

## 6. Run → SUMMARIZING transition

- Progress logic: [cloud/apps/api/src/services/run/progress.ts:140](cloud/apps/api/src/services/run/progress.ts:140)
- On entering `SUMMARIZING`, `queueSummarizeJobs()` runs (progress.ts:207).
- Expected transcript count = `run.progress.completed` (line 267).
- Settles up to 5 s waiting for in-flight transcripts to commit (line 270).

**Failure point 5 — settle timeout.**  At line 224–248 the handler gives up after 5 s and proceeds with whatever transcripts are visible. Logged as a WARN only. If a transcript commit is slow, it is simply skipped for summarization — the probe shows `SUCCESS` but never gets summarized.

Jobs are created per-transcript-found (line 305). If fewer transcripts are visible than expected, fewer summarize jobs get queued.

---

## 7. Summarization

Handler: [cloud/apps/api/src/queue/handlers/summarize-transcript.ts:418](cloud/apps/api/src/queue/handlers/summarize-transcript.ts:418)

For each transcript:
- If `summarizedAt !== null` and no force flag → skip. Logged as INFO, **not counted in `summarizeProgress.completed` or `.failed`** (line 218).
- Otherwise calls Python summarize worker.
- Success → `persistSuccessfulSummary()` (line 392).
- Failure → `persistSummarizeFailure()` (line 404).

**Failure point 6 — silent skip of already-summarized.**  When re-summarization is triggered against transcripts that are already done, progress counters don't move, so `summarizeProgress` can stay stuck below `total`.

**Failure point 7 — summarize job expiration.**  Same dead-letter pattern as probes. Summarize job sits in queue, times out, transcript never gets a summary.

---

## 8. SUMMARIZING → COMPLETED

- Completion logic: [cloud/apps/api/src/queue/handlers/summarize-persistence.ts:93](cloud/apps/api/src/queue/handlers/summarize-persistence.ts:93)

`checkAllSummarized()` returns true iff:
1. No transcripts with `summarizedAt: null`.
2. No missing probes (`findMissingProbes()` returns empty).

If both hold, atomically flips status to `COMPLETED` (summarize-persistence.ts:116) and triggers:
- `triggerBasicAnalysis()` (line 140)
- `queueComputeTokenStats()` (line 151)
- `deductActualProviderBalancesForRun()` (line 157)

**Failure point 8 — side-effect errors swallowed.**  Each of the three post-completion steps is wrapped in its own try/catch (line 146–160). Errors are logged but the run stays `COMPLETED`. Analysis or token stats can silently be missing.

---

## 9. How partial failure actually manifests

A run can end with status `COMPLETED` and still look like this:

```
Run.status            = COMPLETED
Run.progress          = { total: 100, completed: 95, failed: 5 }
Run.summarizeProgress = { total: 95,  completed: 95, failed: 0 }
```

- 5 scenarios never produced a transcript.
- 95 transcripts got summarized.
- Analysis runs against 95, treated as the truth.
- User sees "completed" with no warning banner.

For **paired batches** this is worse: one side of the pair can have 100% success and the other 80%, and there's no "pair completeness" signal in the run record. Downstream analysis has to notice the mismatch itself, and often won't.

---

## 10. Failure-point summary table

| # | Location | What breaks | Recovery | Silent? |
|---|---|---|---|---|
| 1 | [start-queue.ts:122](cloud/apps/api/src/services/run/start-queue.ts:122) | Enqueue drops jobs after retries | None; run marked FAILED | Only first 10 failures logged |
| 2 | [probe handler:192](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:192) | Non-retryable worker error | None; probe stays FAILED | Only visible in DB |
| 3 | [probe handler:374](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:374) | Batch crash → whole batch requeued | Successes idempotent; FAILED probes NOT retried | Opaque |
| 4 | [probe-dead-letter.ts:26](cloud/apps/api/src/queue/handlers/probe-dead-letter.ts:26) | Probe job expires (>30 min) | Marked FAILED with JOB_EXPIRED | No UI signal |
| 5 | [progress.ts:224](cloud/apps/api/src/services/run/progress.ts:224) | Transcript settle timeout | Proceeds with partial count | WARN log only |
| 6 | [summarize-transcript.ts:218](cloud/apps/api/src/queue/handlers/summarize-transcript.ts:218) | Re-summarize skipped for already-done | `summarizeProgress` not incremented | INFO log |
| 7 | Summarize dead-letter | Summarize job expires | Transcript never summarized | No UI signal |
| 8 | [summarize-persistence.ts:146](cloud/apps/api/src/queue/handlers/summarize-persistence.ts:146) | Analysis / token-stats / balance deduct fails | Swallowed; run still COMPLETED | Logged only |
| 9 | [launch-orchestrator.ts:97](cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts:97) | Incomplete pair launched as singleton | None | WARN only |

---

## 11. Things worth checking first when investigating a partial batch

1. `Run.progress.failed` > 0 on a `COMPLETED` run — true partial-failure signal.
2. `Run.progress.completed` vs `Run.summarizeProgress.total` — mismatch means transcripts never made it to summarize queue (failure point 5).
3. Count `ProbeResult` rows where `status = FAILED` and `errorCode = JOB_EXPIRED` — dead-letter problem.
4. For paired-batch runs, compare `ProbeResult` success counts across runs sharing the same `jobChoiceBatchGroupId` in `Run.config` — asymmetry means one side of the pair dropped probes.
5. Transcripts with `summarizedAt IS NULL` on a `COMPLETED` run — means `checkAllSummarized` logic let something through, or summarize job was lost.

---

## 12. Failure-mode deep dive

Follow-up evaluation: for common real-world failure modes, does the code handle it, handle it badly, or not at all? All line numbers verified against the current tree.

### 12.1 Rate limiting (HTTP 429)

- **Detected:** [cloud/workers/common/llm_adapters/base.py:221](cloud/workers/common/llm_adapters/base.py:221) — status-code check plus pattern match ("rate limit", "too many requests").
- **Classified:** `ErrorCode.RATE_LIMIT`, in `RETRYABLE_CODES` at [errors.py:34](cloud/workers/common/llm_adapters/errors.py:34).
- **Backoff:** Fixed exponential list `RATE_LIMIT_BACKOFF_SECONDS = [30, 60, 90, 120]` at [constants.py:14](cloud/workers/common/llm_adapters/constants.py:14). Max 4 retries inside the Python worker.
- **PgBoss layer:** On top of the in-worker retries, PgBoss retries up to 3× with `retryDelay: 5s`, `retryBackoff: true` ([queue/types.ts:102](cloud/apps/api/src/queue/types.ts:102)). Combined upper bound ≈ 12 attempts per probe.
- **Retry-After header:** **Not honored.** Python backoff ignores provider headers entirely.
- **Circuit breaker:** **None.** `maxParallelRequests` is per provider but there's no global "one provider is throttling, slow everyone down" logic.
- **Verdict:** Mostly OK. Gaps: no Retry-After support, no circuit breaker. On sustained provider throttling, the run will burn through all retry budgets and dump a pile of probes into `FAILED` with `errorCode=RATE_LIMIT`.

### 12.2 Quota exhausted / billing errors

- **Detected:** [base.py:230](cloud/workers/common/llm_adapters/base.py:230) — explicit match on `insufficient_quota`, `out of credits`, etc. Ambiguous text like "quota exceeded" defers to 429 classification if both signals are present (line 251).
- **Classified:** `ErrorCode.AUTH_ERROR`, **not** in `RETRYABLE_CODES`. Correct — quota exhaustion should not retry.
- **Run behaviour:** Probe is recorded `FAILED` with `retryCount=0` and the handler returns ([probe-scenario/handler.ts:192](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:192)). The run keeps going, submitting more probes to the same provider, which will all fail the same way.
- **Budget enforcement:** `maxBudgetUsd` is captured at launch but never checked during execution. Noted but not a priority — the field isn't widely used in practice.
- **Verdict:** Classification is correct. Real gap: when one provider's key is out of quota, the system doesn't short-circuit the remaining probes for that provider on that run — it keeps firing them and burning retry time.

### 12.3 Timeouts, DNS, 5xx

- **Classified:** `TIMEOUT`, `NETWORK_ERROR`, `SERVER_ERROR`, all in `RETRYABLE_CODES`.
- **HTTP timeout:** `DEFAULT_TIMEOUT = 300s` ([constants.py:8](cloud/workers/common/llm_adapters/constants.py:8)).
- **Python spawn timeout:** 5 min in the TS handler. So ≈10 min worst-case before a probe is declared timed out.
- **Backoff:** Linear — `2.0 × attempts` seconds, max 3 network retries.
- **Verdict:** Reasonable. Nothing surprising here.

### 12.4 Malformed model output / bad parse

- **JSON parse failure:** `ErrorCode.INVALID_RESPONSE`, **non-retryable** ([base.py:363](cloud/workers/common/llm_adapters/base.py:363)). Correct — the model is the problem; retrying won't help.
- **Transcript-shape validation:** [probe-scenario/handler.ts:214](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:214) throws a plain `Error('Invalid transcript structure')` — no `retryable` flag. Falls through to `handleJobError`, which **retries** it. This is wrong-direction: if our structural check rejects a response, it's either our bug or the model's, neither of which is transient. Fix: wrap in an `LLMError` with `retryable: false`.

### 12.5 Race conditions

**Progress counter race.** [progress.ts:88](cloud/apps/api/src/services/run/progress.ts:88) does the counter bump via `jsonb_set` in a single SQL statement — atomic. But the **status transition** happens in a separate query right after (line 121). Two probe handlers can both come through the atomic increment, both read back "total == completed + failed", and both call `transitionStatus`. In practice the downstream work is idempotent:
- Status update is a conditional `UPDATE ... WHERE status = 'RUNNING'` so only one wins.
- `queueSummarizeJobs` is keyed per-transcript, so duplicates get dropped by the queue.

So duplicate work, no duplicate state. OK, but not by explicit design — it survives because of downstream idempotency.

**Summarize-completion.** [summarize-persistence.ts:123](cloud/apps/api/src/queue/handlers/summarize-persistence.ts:123) uses `UPDATE ... WHERE status = 'SUMMARIZING'` — genuine compare-and-swap. Only the first caller flips the run to `COMPLETED` and runs the side effects. 

**ProbeResult races with dead-letter.**  `ProbeResult` has a unique constraint on `(runId, scenarioId, modelId, sampleIndex)`. `recordProbeSuccess` is an upsert, so:
- Dead-letter writes `FAILED` (retryCount=0) first, then the late-arriving success upserts → row flips to `SUCCESS`. Net result is correct but the progress counter got both increments — `completed` +1 and `failed` +1, so the run's `completed + failed > total`. Worth verifying: does `applyProgressDelta` cap at total, or can the "done" predicate go stale?
- Reverse order is also possible. No explicit guard.

**Concurrent summarize on the same transcript.** Handler's first line is "skip if `summarizedAt` is already set" (line 218). But two concurrent jobs could both pass that check, both call the Python worker, both upsert. The upsert will dedupe the row but both API calls were billed. Same cost-dupe issue as §12.7.

**Settle timeout.** [progress.ts:224](cloud/apps/api/src/services/run/progress.ts:224) waits 5 seconds for in-flight transcripts to commit. Transcripts that arrive at t=5.01s are **not** included in the initial summarize-queue batch. They'll get picked up by later recovery passes (`top-up-probes` / manual `recover_run`) but **only if someone runs those**. Left on its own a late-settling transcript sits unsummarized forever.

### 12.6 Worker process crash mid-call

- **Idempotency keys passed to providers:** **No.** No adapter sets an `Idempotency-Key` header. Grep of `cloud/workers/common/llm_adapters/` confirms.
- **What happens:** Provider completes and bills the request. Python process dies before the TS handler receives output. PgBoss re-runs the job after `expireInSeconds: 420`. The re-run finds no `ProbeResult` and no `Transcript`, calls the provider again, gets charged again. No dedup.
- **Verdict:** Real gap. Every worker crash = potential double-billing. Fix: set `Idempotency-Key: <runId>:<scenarioId>:<modelId>:<sampleIndex>` on all adapter requests. (OpenAI and Anthropic both support this header.)

### 12.7 PgBoss timing

- **Probe queue:** `expireInSeconds: 420` (7 min), `retryLimit: 3`, `retryDelay: 5s`, `retryBackoff: true` ([queue/types.ts:102](cloud/apps/api/src/queue/types.ts:102)).
- **Dedup:** None at the PgBoss layer. Handler-level idempotency (the check at handler.ts:71) is what prevents double-writes. But the Python worker has already run by the time that check fires on a retry — so we avoid DB duplication, not API duplication.
- **Dead-letter:** Handled once, no retry ([probe-dead-letter.ts:26](cloud/apps/api/src/queue/handlers/probe-dead-letter.ts:26)).

### 12.8 Concurrent launches competing for slots

- Queue is keyed by **provider**, not by run. `maxParallelRequests` caps concurrent in-flight requests per provider.
- Two runs starting at the same time interleave their jobs FIFO inside the provider queue. A big run can't *starve* a small one — jobs come off in order — but a big run does extend the head-of-line latency for everyone behind it.
- `PROBE_QUEUE_DEPTH_PER_PROVIDER` (the name used in my earlier write-up) turned out to be a misreading — the actual cap is `maxParallelRequests` per provider, not per run.
- No per-run isolation, no priority queue, no preemption. OK for current scale, will bite at higher concurrency.

### 12.9 Summary — how the common real-world failures actually behave

| Failure | Classified? | Retried sensibly? | Idempotent? | Biggest real risk |
|---|---|---|---|---|
| 429 rate limit | ✅ | ✅ exp backoff | ⚠ API double-call on PgBoss retry | No Retry-After, no global circuit breaker |
| Quota exhausted | ✅ | ✅ non-retryable | ✅ | Keeps firing further probes to same provider |
| Timeout / 5xx | ✅ | ✅ | ⚠ API double-call | Fine |
| Malformed JSON | ✅ | ✅ non-retryable | ✅ | Fine |
| Bad transcript shape | ❌ | ❌ retried | ✅ | Wastes retries on a non-transient bug |
| Worker crash mid-call | ❌ | Re-run creates second call | ❌ | **Double-billing** — no idempotency keys |
| Progress race → completion | ⚠ read-then-write | ✅ via downstream idempotency | ✅ | Works by accident; fragile |
| Transcript settle > 5 s | ⚠ timeout | ⚠ delayed or never | ✅ | Late transcripts can be stranded unsummarized |
| Dead-letter vs late success | ⚠ | ⚠ progress double-count | ✅ data | Counters can exceed `total`, confusing UI |
| Concurrent runs | N/A | N/A | N/A | Big runs inflate head-of-line latency; no per-run fairness |

### 12.10 Highest-leverage fixes

1. **Provider idempotency keys** — stop double-billing on worker crash / PgBoss retry. One-line change per adapter.
2. **Fast-fail a provider inside a run when quota is exhausted** — one `AUTH_ERROR` from `insufficient_quota` should short-circuit the rest of that run's probes to that provider.
3. **Mark bad-transcript-shape as non-retryable** — [handler.ts:214](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts:214) should throw an `LLMError` with `retryable: false`.
4. **Late-transcript safety net** — periodic reconciliation job that finds `Transcript` rows on `SUMMARIZING`/`COMPLETED` runs with `summarizedAt IS NULL` and queues them. Currently relies on humans running `recover_run`.
5. **Honor Retry-After** — cheap improvement to rate-limit handling.
6. **Circuit breaker per provider** — when one run starts getting walls of 429s, don't let concurrent runs pile on.

---

## 13. Key files referenced

- Entry: [cloud/apps/api/src/graphql/mutations/domain/evaluation.ts](cloud/apps/api/src/graphql/mutations/domain/evaluation.ts)
- Launch orchestration: [cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts](cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts)
- Slot planning: [cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts](cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts)
- Queue start: [cloud/apps/api/src/services/run/start-queue.ts](cloud/apps/api/src/services/run/start-queue.ts)
- Probe handler: [cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts](cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts)
- Probe dead letter: [cloud/apps/api/src/queue/handlers/probe-dead-letter.ts](cloud/apps/api/src/queue/handlers/probe-dead-letter.ts)
- Progress/transition: [cloud/apps/api/src/services/run/progress.ts](cloud/apps/api/src/services/run/progress.ts)
- Summarize handler: [cloud/apps/api/src/queue/handlers/summarize-transcript.ts](cloud/apps/api/src/queue/handlers/summarize-transcript.ts)
- Completion: [cloud/apps/api/src/queue/handlers/summarize-persistence.ts](cloud/apps/api/src/queue/handlers/summarize-persistence.ts)
- Python probe worker: [cloud/workers/probe.py](cloud/workers/probe.py)
- Schema: [cloud/packages/db/prisma/schema.prisma](cloud/packages/db/prisma/schema.prisma)
