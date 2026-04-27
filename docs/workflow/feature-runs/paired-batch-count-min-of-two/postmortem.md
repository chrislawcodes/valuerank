# Post Mortem — `paired-batch-count-min-of-two`

**PR:** [chrislawcodes/valuerank#759](https://github.com/chrislawcodes/valuerank/pull/759)

## What went well

1. **Verification phase before spec authoring caught the real coupling map.** The user's brief flagged 3 traps; the prod-DB spot-check + grep across `cloud/apps/api/src` and `cloud/workers` confirmed (a) `aggregate-preparation`, circumplex, and `aggregate-fingerprint-payload` use `companionRunId` not `jobChoiceBatchGroupId` — so the analysis pipeline is unaffected, and (b) the anomaly detector still needs the field, so `jobChoiceBatchGroupId` writes must stay in launch path. Spending 20 minutes on verification before spec authoring saved a round of "but you forgot consumer X" reviews.

2. **Prod data spot-check told me the size of the legacy-data drop.** §6.3 found 116 non-aggregate runs (8.4%) lacking `jobChoiceValueFirst` (all pre-2026-03-30, all on 90 still-alive definitions). This let me commit to the loose-pairing semantic with confidence — the legacy drop is real but bounded, and all affected definitions also have post-March-30 runs so no cell will permanently zero out.

3. **Additive Slice 1 design avoided a broken intermediate state.** Tasks-stage Codex execution review flagged the original Slice 1 plan (which would have left the API in a `// @ts-expect-error` state) as a HIGH. Restructuring to add the new helper alongside the old one (rather than replacing) kept every commit fully buildable and testable. Slice 2 then dropped the old helper in one clean commit. No temporary hacks, no broken-tree windows.

4. **Set-of-groupIds defensive structure was a free win.** Codex slice-1 diff review flagged duplicate-run inflation as a MEDIUM. Switching from `Map<direction, number>` to `Map<direction, Set<groupId>>` cost ~5 extra lines and made the algorithm robust against retry duplicates (which the prod data shows we don't have today, but the structure costs nothing).

5. **Reconciliation log discipline.** Each spec round added a "Round N" entry in §11 with HIGH/MEDIUM finding → fix mapping. By round 3, reviewers could see at a glance what had already been addressed vs. what was being raised fresh.

## What didn't work

1. **The 3-round adversarial review loop spent rounds 2 and 3 mostly re-litigating directional choices rather than finding new bugs.** The HIGH on "trial-count divergence" appeared in spec rounds 1, 2, 3, and both diff rounds — the reviewers correctly identified the divergence but disagreed with the chosen position. I addressed it in spec §5.7 explicitly choosing to defer; reviewers raised it again. The runner has no concept of "this is a chosen-direction trade-off, do not re-raise" so each round burned ~10 minutes of review time on the same ground.

2. **Repair timeouts kept tripping at 300s on the 3-round mark.** The runner's `repair` command times out at 300s, but parallel codex+gemini reviews routinely take longer. Workaround: dropped to `checkpoint --use-existing-artifact --gemini-timeout-seconds 600 --gemini-retries 2` directly, which worked. The base `repair` command should probably take a `--timeout` flag or default higher.

3. **The runner's "next-action" routing didn't recognize when I was ready to advance.** After 3 spec rounds with all HIGH/MEDIUM findings reconciled (each reconcile call returned `→ next: run_spec_checkpoint`), I had to use the `advance --reason` escape hatch to move on. Better default: after 3 rounds with all reviews in `accepted` status, the runner should route to `author_plan` instead of `run_spec_checkpoint`.

4. **Test-DB-dependent integration tests can't run without Docker.** The full `npm run test --workspace @valuerank/api` failed 496/2178 tests due to PrismaClient initialization (no Postgres on port 5433). I confirmed via `npm run test --workspace @valuerank/api -- domain-coverage` that the changed area is fully green, but couldn't validate the rest. CI will catch any breakage. Improvement: a documented `npm run test:unit` target that skips DB-bound tests would let local preflight stay tight.

5. **The codex-skills `repair` command rebuilds all 3 reviews even when only the artifact's resolution status changed.** Each repair cycle dispatched 2 codex reviews + 1 gemini review (~10 min each). For minor reconciliation edits that don't materially change the artifact, this is overkill. A `--only-stale` mode would help.

## Specific proposed workflow changes

These need human approval before applying to any guide or script.

| # | Change | Where | Rationale |
|---|---|---|---|
| 1 | Reviewer prompts should include a "previously addressed in §X" allowlist they can be told NOT to re-raise. | `docs/workflow/operations/codex-skills/review-lens/prompts/*` | Avoid burning rounds 2/3 on already-decided directional trade-offs. |
| 2 | `run_factory.py repair` should accept `--timeout` / `--gemini-timeout-seconds` and default higher (e.g. 600s) — match `checkpoint`. | `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py` | Avoids the 300s timeout that killed 2 of my 3 spec-stage repair runs. |
| 3 | After 3 reconciled rounds with all reviews `accepted`, runner should route `next-action` to the next stage (e.g. `author_plan`) instead of `run_spec_checkpoint`. The `advance` escape hatch shouldn't be needed for the happy path. | `run_factory.py` recommend_next_action | The `advance --reason` flow is for emergencies; happy-path advancement should be automatic. |
| 4 | Document `npm run test --workspace @valuerank/api -- <pattern>` as the "scoped preflight" alternative when test DB isn't available; add to `cloud/CLAUDE.md`. | `cloud/CLAUDE.md` | Avoids new contributors thinking the suite is broken. |
| 5 | `repair` command (or a new `repair --only-stale` mode) should regenerate only the reviews whose artifact_sha changed since they ran, not all 3. | `repair_review_checkpoint.py` | Saves 10+ minutes per minor edit cycle. |
| 6 | When `deliver --create-pr` fails on a head-mismatch after a rebase + reconciliation commit, the runner should detect the diff is content-equivalent (not a real code change) and let the deliver record advance without forcing a re-review. | `run_factory.py deliver` | Otherwise rebases force a wasted full diff-review cycle. |

## Numbers

- **Total wall time:** ~5 hours (across two quota windows).
- **Adversarial review cycles:** 3 spec + 1 plan + 1 tasks + 2 diff = 7 review rounds × 3 reviewers = 21 review files generated.
- **Source-code lines changed:** +207 / −131 = 76 net (net of test additions).
- **Test count delta:** 51 → 63 (+12 in the changed file).
- **Forbidden files touched:** 0 (verified).
