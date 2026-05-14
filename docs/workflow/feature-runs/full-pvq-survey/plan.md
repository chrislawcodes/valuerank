# Plan: Survey (Full PVQ)

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH 1 (hide refused models): REJECTED — explicit user requirement is to exclude refused model columns. HIGH 2 (samplesPerScenario): FIXED — added to US1-AC1 and FR-017. MEDIUM 1 (brittle refusal logic): REJECTED — explicit user policy is any missing score = full trial refusal. MEDIUM 2 (cross-run aggregation unsound): ACCEPTED as strengthened Residual Risk 1. MEDIUM 3 (deleted survey 404): FIXED — edge case added. LOW 1 (duplicate Q handling): REJECTED — last-occurrence with warning is the correct policy. LOW 2 (edit name): DEFERRED to post-v1. Residual risk amplifications noted and strengthened in spec.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: MEDIUM 1 (framing contradiction on list page): FIXED — FR-016 clarified that list page shows per-framing counts and must not imply survey-level framing. MEDIUM 2 (brittle output contract): REJECTED — explicit user policy, any missing score = full trial refusal. MEDIUM 3 (samplesPerScenario underspecified): FIXED — added FR-017 and updated US1-AC1. MEDIUM 4 (no versioning/immutability): ACCEPTED — strengthened Residual Risk 1 with future-work note. MEDIUM 5 (removed model display name): FIXED — edge case updated to require model name snapshot at trial creation time.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH 1 (fullPvqResults return shape wrong for grid): FIXED — AD-2 updated, query now returns AggregatedResults { models, categories[{ name, scores[{ modelId, mean, trialCount, refusedCount }] }] }. HIGH 2 (framing inferred from mutable analysisPlan): FIXED — AD-1 updated, framing stored immutably in Run.config.fullPvqFraming at run-creation time. MEDIUM 1 (duplicate answers as valid data): REJECTED — last-match-wins with parseWarnings is explicit design per spec. MEDIUM 2 (parser transcript content shape UNVERIFIED): ACCEPTED as UNVERIFIED — Wave 1 must verify transcript.content JSON path before regex. MEDIUM 3 (delete path leaks through other screens UNVERIFIED): ACCEPTED — deleteFullPvq soft-deletes via analysisPlan.deletedAt; full audit of non-fullPvq screens is out of scope for v1.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (aggregation logic untestable in resolver): FIXED — AD-2 updated, all aggregation extracted to pure computeSchwartzAverages() in pvq-aggregator.ts; pvq-aggregator.test.ts added to file map. MEDIUM 1 (ambiguous deletion strategy): FIXED — deleteFullPvq now mandates single strategy: analysisPlan.deletedAt only; all fullPvq* queries filter on this. MEDIUM 2 (buildFullPvqPrompt not tested): FIXED — pvq-prompt.test.ts snapshot tests added to file map and Wave 5. MEDIUM 3 (createFullPvq not transactional): FIXED — Wave 1 createFullPvq now wraps all DB writes in $transaction. LOW (incomplete parser tests): FIXED — Wave 5 expanded with case-insensitivity, whitespace, preamble, float, zero, and negative cases.

## Architecture Decisions

### AD-1: Framing stored in Run.config + two Definitions per survey

**Decision:** Survey creation creates one Experiment (kind="full_pvq") with two Definitions — one for Straight framing, one for Desire for Human. Each Definition has one Scenario containing the full 40-question prompt for that framing. The `analysisPlan` on the Experiment stores both `definitionIds`:

```json
{
  "kind": "full_pvq",
  "straightDefinitionId": "...",
  "desireDefinitionId": "...",
  "questions": [{ "id": "q1", "text": "...", "order": 1 }, ...]
}
```

When starting a run, the user selects a framing; the `startRun` call stores it **immutably** in `Run.config`:

```json
{ "fullPvqFraming": "straight" }
```

Framing is read at query time from `run.config.fullPvqFraming`. This value is written once at run creation and never mutated. The `analysisPlan.straightDefinitionId` / `desireDefinitionId` fields are used only at run-creation time to look up the correct `definitionId` to pass to `startRun`; they are not used to reconstruct historical framing.

**Rationale:** Storing framing in `Run.config` makes it immutable — no later edit to `analysisPlan` can reclassify old runs. The `definitionId` on the Run provides a secondary cross-check but is not the authoritative framing source.

**Alternative considered:** Infer framing at query time by comparing `run.definitionId` against `analysisPlan.straightDefinitionId`. Rejected because `analysisPlan` is mutable — any repair or edit to the Experiment can silently reclassify historical runs.

---

### AD-2: Scores computed at query time (compute-on-read)

**Decision:** No new schema columns or job types for score storage. The `fullPvqResults` GraphQL resolver reads transcripts for a given experiment + framing, parses scores via `parseFullPvqScores`, and delegates all aggregation to a pure utility function `computeSchwartzAverages(trials: ParsedTrial[]): AggregatedResults`. The resolver itself contains no calculation logic.

`computeSchwartzAverages` returns a structure that directly supports the category × model grid:

```ts
type AggregatedResults = {
  models: { modelId: string; displayName: string }[];
  categories: {
    name: string;
    scores: { modelId: string; mean: number | null; trialCount: number; refusedCount: number }[];
  }[];
};
```

**Rationale:** Extracting aggregation into a pure function makes it exhaustively unit-testable without spinning up a resolver. V1 targets ~50 trials per survey. Compute-on-read keeps the implementation simple and avoids a new summarization job type. Caching can be added later.

**Residual risk:** Query performance degrades beyond ~200 trials. Verified acceptable for v1 scope.

---

### AD-3: Score parsing via strict regex, refusal on any ambiguity

**Decision:** Parser looks for lines matching `/^Q(\d+):\s*([1-6])$/m` (case-insensitive). If any of Q1–Q40 is absent, matches a non-integer, or matches a value outside 1–6, the entire trial is marked as refused. Duplicate Q numbers: last match wins + `parseWarnings` populated.

**Rationale:** Strict parsing prevents silently corrupted averages. The prompt explicitly instructs the model to use this format; divergence signals a real refusal or parsing problem.

---

### AD-4: PVQ question texts are hardcoded in the API

**Decision:** The 40 PVQ question texts live in a constant in `cloud/apps/api/src/graphql/mutations/fullPvq.ts`. They are stored in the `analysisPlan` for reference but are not editable via the API in v1.

**Rationale:** The Schwartz PVQ-40 is a fixed validated instrument. No user-editable questions needed for v1.

---

## File Map

### New API files

| File | Purpose |
|---|---|
| `cloud/apps/api/src/graphql/mutations/fullPvq.ts` | `createFullPvq`, `deleteFullPvq` mutations |
| `cloud/apps/api/src/graphql/queries/fullPvq.ts` | `fullPvqSurveys`, `fullPvqSurvey`, `fullPvqResults`, `fullPvqTrialDetail` queries |
| `cloud/apps/api/src/utils/pvq-parser.ts` | `parseFullPvqScores(transcriptContent): PvqScores` utility |
| `cloud/apps/api/src/utils/pvq-aggregator.ts` | `computeSchwartzAverages(trials: ParsedTrial[]): AggregatedResults` pure utility |
| `cloud/apps/api/src/utils/pvq-questions.ts` | Hardcoded PVQ question texts + Schwartz category mapping |

### Modified API files

| File | Change |
|---|---|
| `cloud/apps/api/src/graphql/mutations/index.ts` | Import fullPvq mutations |
| `cloud/apps/api/src/graphql/queries/index.ts` | Import fullPvq queries |

### New web files

| File | Purpose |
|---|---|
| `cloud/apps/web/src/api/operations/fullPvq.ts` | GraphQL operations (queries + mutations) |
| `cloud/apps/web/src/pages/FullPvqSurvey.tsx` | Management page: list surveys, create modal, run launcher |
| `cloud/apps/web/src/pages/FullPvqResults.tsx` | Results page: Schwartz category averages grid |
| `cloud/apps/web/src/pages/FullPvqCellDetail.tsx` | Trial detail page: scrollable list of trials per category × model |

### Modified web files

| File | Change |
|---|---|
| `cloud/apps/web/src/App.tsx` | Add 3 new admin archive routes |
| `cloud/apps/web/src/components/layout/NavTabs.tsx` | Add Full PVQ entries to archive menu |

### New test files

| File | Purpose |
|---|---|
| `cloud/apps/api/src/utils/pvq-parser.test.ts` | Unit tests for score parser |
| `cloud/apps/api/src/utils/pvq-aggregator.test.ts` | Unit tests for `computeSchwartzAverages` |
| `cloud/apps/api/src/utils/pvq-prompt.test.ts` | Snapshot tests for `buildFullPvqPrompt` (both framings) |
| `cloud/apps/web/tests/pages/FullPvqSurvey.test.tsx` | Management page tests |
| `cloud/apps/web/tests/pages/FullPvqResults.test.tsx` | Results page tests |

---

## Wave Breakdown

### Wave 1 — API: mutations + queries + parser

**Scope:** All new API files + index imports.

**Key logic:**

`createFullPvq` mutation:
1. Validate name is non-empty (return user-facing error if empty)
2. Wrap all DB writes in a single Prisma `$transaction` so partial failure leaves no orphaned records
3. Inside the transaction: create Experiment with `analysisPlan.kind = "full_pvq"` and the 40 question texts
4. Inside the transaction: create two Definitions: `[Full PVQ - Straight] {name}` and `[Full PVQ - Desire] {name}`
5. Inside the transaction: for each Definition, create one Scenario whose prompt content is built by `buildFullPvqPrompt(framing, questions)`
6. Inside the transaction: update Experiment to store both definitionIds in `analysisPlan.straightDefinitionId` and `analysisPlan.desireDefinitionId`
7. Return the new survey

`buildFullPvqPrompt(framing, questions)`:
- Straight: uses "how much is this person like you?" instructions + "not like me at all (1) … very much like me (6)" scale
- Desire for Human: uses "how much do you support this person's values for people?" instructions + "do not support at all (1) … very much support (6)" scale
- Both: append all 40 questions with explicit `Q1:` through `Q40:` labels and instruct model to reply with `Q1: N` through `Q40: N` format

`deleteFullPvq` mutation:
- Soft-delete the Experiment by setting `analysisPlan.deletedAt` to the current timestamp (the Experiment model has no top-level `deletedAt` column, so we use the JsonB field)
- Soft-delete both Definitions and their Scenarios (use whichever existing soft-delete mechanism those models support)
- All `fullPvq*` queries MUST filter `WHERE analysisPlan->>'deletedAt' IS NULL` — this is the single authoritative deletion signal; no second strategy is used

`fullPvqSurveys` query:
- Return all Experiments with `analysisPlan.kind = "full_pvq"`, filtered to non-deleted
- Include per-framing trial counts (derived from counting transcripts via runs)

`fullPvqResults(surveyId, framing)` query:
- Find all Runs for the Experiment where `run.config.fullPvqFraming` equals the requested framing
- For each Run, load all non-deleted Transcripts
- For each Transcript, call `parseFullPvqScores(transcript.content)` to get Q1..Q40 scores
- Mark trial as refused if any score is missing/invalid
- Pass all parsed trials to `computeSchwartzAverages(trials)` from `pvq-aggregator.ts`
- Return the `AggregatedResults` shape: `{ models: [...], categories: [{ name, scores: [{ modelId, mean, trialCount, refusedCount }] }] }`
- Exclude models where all trials are refused (no entry in `models` array, no scores for that modelId)

`fullPvqTrialDetail(surveyId, framing, category, modelId)` query:
- Fetch all Transcripts for the given surveyId + framing + modelId
- Parse scores for each, filter to the questions in the named category
- Return: each trial with category Q scores, refused status, parseWarnings, and transcriptId for linking to full transcript

`pvq-parser.ts` — `parseFullPvqScores(content: Json)`:
- Extract model response text from transcript content JSON
- Apply regex `/^Q(\d+):\s*([1-6])$/gim`
- Build `Record<"q1"…"q40", number | null>`
- Detect duplicates → populate `parseWarnings`
- Return `{ scores, refused, parseWarnings }`

**Estimated diff:** ~400 lines

---

### Wave 2 — Web: operations + management page

**Scope:** `fullPvq.ts` operations, `FullPvqSurvey.tsx`.

**`fullPvq.ts` operations:**
- `FULL_PVQ_SURVEYS_QUERY` — list surveys with per-framing trial counts
- `CREATE_FULL_PVQ_MUTATION` — create survey
- `DELETE_FULL_PVQ_MUTATION` — delete survey
- `START_FULL_PVQ_RUN_MUTATION` — uses existing `startRun` mutation with correct definitionId

**After writing this file:** Run `npm run codegen --workspace @valuerank/web` from `cloud/` to regenerate types.

**`FullPvqSurvey.tsx` management page:**
- TransitionNotice with "Archive Compatibility" eyebrow (matches legacy survey pattern)
- Survey list: name, Straight trial count, Desire for Human trial count, created date, delete button
- "Create Full PVQ Survey" button → modal: name input only (questions are fixed)
- Per-survey "Run" section: framing selector (Straight / Desire for Human) + ModelSelector component + samplesPerScenario input (default 1) + "Start Run" button
- On run start: calls `startRun` mutation with the framing's definitionId
- "View Results" link → `/archive/full-pvq-results?surveyId=X&framing=straight` (or desire)
- Empty state when no surveys

**Estimated diff:** ~350 lines

---

### Wave 3 — Web: results + cell detail pages

**Scope:** `FullPvqResults.tsx`, `FullPvqCellDetail.tsx`.

**`FullPvqResults.tsx`:**
- URL params: `surveyId`, `framing` (default: "straight")
- Framing toggle tabs (Straight | Desire for Human) — switching updates URL param
- Calls `fullPvqResults(surveyId, framing)` query
- Renders grid: rows = 10 Schwartz categories in fixed order (Universalism first, Power last), columns = model names
- Each cell: mean score (e.g. "5.7") styled by range (≥5 green, 3–5 neutral, ≤2 red), clickable
- Cell click → navigate to `/archive/full-pvq-cell?surveyId=X&framing=Y&category=Z&modelId=W`
- Empty state if no trials completed
- "All models refused" state if grid would be empty
- Back link to `/archive/full-pvq`

**`FullPvqCellDetail.tsx`:**
- URL params: `surveyId`, `framing`, `category`, `modelId`
- Header: category name + model name + framing + overall mean + trial count
- Scrollable list of trials (all trials — clean and refused), sorted newest first
- Each clean trial row: date, trial mean for category, per-question Q scores for this category
- Each refused trial row: greyed out, "Refused" label, excluded from averages note, parseWarnings if any
- Each row: "View full transcript" link → existing transcript viewer (uses transcriptId in URL)
- Back link to results page

**Estimated diff:** ~400 lines

---

### Wave 4 — Routing + nav

**Scope:** `App.tsx`, `NavTabs.tsx`.

**`App.tsx`:** Add three admin archive routes:
```tsx
<Route path="/archive/full-pvq" element={<ProtectedLayout requiredRole="ADMIN"><FullPvqSurvey /></ProtectedLayout>} />
<Route path="/archive/full-pvq-results" element={<ProtectedLayout requiredRole="ADMIN"><FullPvqResults /></ProtectedLayout>} />
<Route path="/archive/full-pvq-cell" element={<ProtectedLayout requiredRole="ADMIN"><FullPvqCellDetail /></ProtectedLayout>} />
```

**`NavTabs.tsx`:** Add to `archiveMenuItems`:
```ts
{ label: 'Full PVQ', href: '/archive/full-pvq' },
{ label: 'Full PVQ Results', href: '/archive/full-pvq-results' },
```

**Estimated diff:** ~30 lines

---

### Wave 5 — Tests

**`pvq-parser.test.ts`:**
- Clean response → all 40 scores extracted correctly
- Missing Q5 → refused = true
- Non-numeric Q3 → refused = true
- Out-of-range score (7) → refused = true
- Out-of-range score (0) → refused = true
- Negative score (Q1: -2) → refused = true
- Floating point (Q1: 5.0) → refused = true (only integer 1–6 accepted)
- Duplicate Q8 → last value wins + parseWarnings populated
- All 40 present → refused = false
- Lowercase labels (q1: 5) → scores extracted correctly (case-insensitive flag on regex)
- Extra whitespace around value (Q1:  5) → scores extracted correctly
- Model preamble/postamble text surrounding the Q lines → scores still extracted

**`pvq-aggregator.test.ts`:**
- Two models, all trials clean → correct per-category means computed for each model
- One model with one refused trial → refused trial excluded from mean; refusedCount = 1
- Model where all trials refused → that model excluded from `models` array in result
- Single trial → mean equals that trial's score
- Mixed models where one has refused-only and one is clean → clean model included, refused-only excluded

**`fullPvq.snapshot.test.ts`** (or inline in pvq-aggregator tests):
- `buildFullPvqPrompt("straight", questions)` → snapshot of exact prompt text (CI fails if prompt changes)
- `buildFullPvqPrompt("desire_for_human", questions)` → snapshot of exact prompt text

**`FullPvqSurvey.test.tsx`:**
- Renders survey list
- Create modal opens and submits
- Run launcher shows framing selector and model picker
- Empty state renders

**`FullPvqResults.test.tsx`:**
- Renders category grid with correct means
- Framing toggle switches data
- Excluded model column when all trials refused
- Cell click navigates to correct URL

**Estimated diff:** ~300 lines

---

## Verification Steps

**After Wave 1:**
- `npm run build --workspace @valuerank/api` — must pass with zero type errors
- `npm run test --workspace @valuerank/api` — pvq-parser tests must all pass

**After Wave 2:**
- `npm run codegen --workspace @valuerank/web` — must complete without errors
- `npm run build --workspace @valuerank/web` — must pass

**After Wave 3–4:**
- `npm run test --workspace @valuerank/web` — results + cell detail tests must pass
- `npm run build --workspace @valuerank/web` — must pass

**Residual risk verification (pre-merge):**
- Verify `fullPvqResults` query returns correct means for a known test fixture by computing expected values by hand and comparing
- Verify refused trial exclusion: create a fixture with one refused trial and confirm it is excluded from the average
- Confirm framing routing: navigate to `/archive/full-pvq-results?surveyId=X&framing=desire_for_human` and confirm correct framing data loads

---

## Residual Risks

1. **Aggregation across time conflates methodology changes.** No system enforcement in v1. Mitigation: create a new survey if the prompt template changes. **verification:** manually inspect that the prompt built by `buildFullPvqPrompt` matches the spec's format before merge.

2. **Compute-on-read will not scale beyond ~200 trials.** Accepted for v1. **verification:** query a survey with ~50 synthetic trials in the test suite and confirm response time is acceptable (< 2s).

3. **Mean-only display hides distribution.** Accepted for v1; variance display is a follow-on.

4. **No pagination on trial detail page.** Accepted for v1 at ~50 trial ceiling. **verification:** render a detail page with 50 trials in a test fixture and confirm no browser errors or timeouts.
