# Spec: Survey (Full PVQ)

**Slug:** full-pvq-survey  
**Created:** 2026-05-14  
**Status:** draft  
**Input:** Build a new "Survey (Full PVQ)" page under /archive that sends the full 40-question Schwartz PVQ as a single prompt per model, aggregates scores into Schwartz category averages across all trials over time, and shows results in a categories × models grid.

---

## Background

ValueRank currently has a legacy survey system that sends each PVQ question as a separate API call (one scenario per question). This feature builds a new, independent surface that sends all 40 questions in one prompt — matching how a human takes the test and reducing API call overhead. Results are aggregated across all trials over time into Schwartz category averages.

The existing survey pages remain untouched. This is a new surface, not a replacement.

**Framing model:** Framing ("Straight" or "Desire for Human") is a property of a **run**, not the survey. A survey is just a name and a question set. Each run specifies which framing to use, and the results page aggregates all trials filterable by framing. This allows a single survey to accumulate data under both framings over time.

---

## User Stories

### User Story 1 — Create and run a Full PVQ survey (P1)

As an admin, I need to create a Full PVQ survey with a chosen framing, select models, and start a run so that I can collect AI responses to the Schwartz PVQ.

**Why P1:** Without this, no data can be collected. It is the entry point for the entire feature.

**Independent test:** Navigate to /archive/full-pvq, create a survey, pick a framing and models, start a run, and confirm the run appears in progress.

**Acceptance scenarios:**

1. **Given** I am an admin on /archive/full-pvq, **When** I create a Full PVQ survey with a name, then start a run selecting framing (Straight or Desire for Human), models, and number of trials per model (samplesPerScenario, default 1), **Then** a run is created and each selected model receives one API call per trial containing all 40 questions formatted as: instructions + numbered question list + response scale (1–6). The model is instructed to reply with exactly "Q1: N" through "Q40: N" on separate lines.

2. **Given** a run is in progress, **When** a model returns a response with all 40 Q:N scores present, **Then** the trial is recorded as complete and scores are stored.

3. **Given** a run is in progress, **When** a model returns a response with one or more Q scores missing, **Then** that trial is recorded as a refusal and excluded from aggregation.

4. **Given** a survey already exists, **When** I start a second run against the same survey and framing, **Then** the new trials are added to the existing pool and the results page reflects all trials combined.

---

### User Story 2 — View category averages across all trials (P1)

As an admin, I need to see Schwartz category averages for each model across all trials so that I can compare value profiles between models.

**Why P1:** Without results, the feature has no output.

**Independent test:** After completing at least one trial per model, navigate to /archive/full-pvq-results and confirm the categories × models grid shows correct mean scores.

**Acceptance scenarios:**

1. **Given** completed trials exist, **When** I open the results page for a survey + framing, **Then** I see a grid with Schwartz categories as rows and models as columns, each cell showing the mean score (1–6) for that category aggregated across all non-refused trials for that model.

2. **Given** all trials for a model are refused, **When** the results page loads, **Then** that model's column is excluded from the grid entirely.

3. **Given** trials from multiple runs exist for the same survey + framing, **When** the results page loads, **Then** all clean trials from all runs contribute to the displayed averages.

4. **Given** a framing toggle exists on the results page, **When** I switch from Straight to Desire for Human, **Then** the grid updates to show averages from the selected framing only.

---

### User Story 3 — Inspect trial detail for a category × model cell (P1)

As an admin, I need to drill into a cell and see the individual trials that produced that average so that I can audit model responses and spot refusals.

**Why P1:** Without the ability to inspect trials, aggregated scores cannot be verified and refusals cannot be reviewed.

**Independent test:** Click a cell in the results grid and confirm the trial detail page shows each trial's Q scores for that category, with refused trials greyed out.

**Acceptance scenarios:**

1. **Given** I click a cell in the results grid, **Then** I navigate to a separate trial detail page showing: the category name, model name, framing, overall mean, and a list of all trials.

2. **Given** a trial detail page, **When** viewing a clean trial, **Then** I see the Q scores for each question in that category and the trial's category mean.

3. **Given** a trial detail page, **When** viewing a refused trial, **Then** the trial row is greyed out, labelled "Refused", and marked as excluded from averages.

4. **Given** a trial detail page, **When** I click "View full transcript" on a trial, **Then** I see the full conversation between the system and the model for that trial.

---

### User Story 4 — Manage Full PVQ surveys (P2)

As an admin, I need to list, view, and delete Full PVQ surveys so that I can manage the survey catalogue.

**Why P2:** Useful but the feature functions without it for an initial run.

**Acceptance scenarios:**

1. **Given** surveys exist, **When** I visit /archive/full-pvq, **Then** I see a list of Full PVQ surveys with name, framing, run count, and total trial count.

2. **Given** a survey exists, **When** I delete it, **Then** the survey and all associated runs are soft-deleted and no longer appear in the list.

---

## Edge Cases

- **All models refuse:** Show an empty grid with a message explaining no models produced valid results for the selected framing.
- **Partial category scores:** A question within a category goes unanswered (rest answered) — entire trial is a refusal since any missing score triggers exclusion.
- **No runs yet:** Results page for a survey with zero runs shows an empty state with a link back to the management page.
- **Model removed mid-series:** If a model is removed from the system after trials were collected, its historical trials still contribute to the aggregate; the column still appears using the model's last known display name with a "(removed)" label.
- **Duplicate Q labels in response:** If the model repeats a Q number, take the last occurrence AND flag the trial on the detail page with a "Duplicate answers detected" warning so admins can investigate.
- **Non-numeric response to a question:** Treat as missing → refusal for that trial.
- **Out-of-range score (outside 1–6):** Treat as missing → refusal for that trial.
- **Run transport failure / timeout:** The trial is left in a failed state by the existing run infrastructure; treat failed trials the same as refused trials (excluded from aggregation, shown on detail page with "Failed" label).
- **Prompt template change:** If the wrapping prompt is changed, a new survey should be created rather than reusing an existing one, to avoid mixing data from different methodologies. No system-level enforcement exists in v1.
- **Deleted survey accessed via URL:** Return a clear "Survey not found" page rather than a blank screen or generic error.
- **Model deleted after trials collected:** The trial creation process MUST snapshot the model's display name at run time so the "(removed)" column can still be labelled correctly even if the model record is later deleted.

---

## Functional Requirements

- **FR-001:** System MUST support two framings per run: Straight ("how much is this person like you?") and Desire for Human ("how much do you support this person's values for people?"). Framing is set at run creation, not at survey creation. (US1)
- **FR-002:** System MUST send all 40 PVQ questions in a single prompt per model per trial. The prompt MUST instruct the model to reply with exactly "Q1: N" through "Q40: N" (one per line, integer 1–6). (US1)
- **FR-003:** System MUST detect a refused trial when any of Q1–Q40 is: missing from the response, non-numeric, or outside the range 1–6. Refused trials are excluded from all aggregation. (US1, US3)
- **FR-004:** System MUST exclude a model from the results grid when all of its trials are refused. (US2)
- **FR-005:** System MUST aggregate trial scores across all runs for the same survey + framing combination. New runs append to the existing trial pool. (US1, US2)
- **FR-006:** System MUST display results as a grid: Schwartz categories (10 rows) × models (N columns), each cell showing the mean score rounded to one decimal place. (US2)
- **FR-007:** System MUST map Q1–Q40 to the 10 Schwartz value categories using the canonical mapping defined in this spec. (US2)
- **FR-008:** System MUST navigate to a separate trial detail page when a cell is clicked; the detail page MUST show all trials (clean and refused) for that category × model pair. (US3)
- **FR-009:** Refused trials on the detail page MUST be visually distinguished (greyed out) and labelled as excluded. (US3)
- **FR-010:** Each trial on the detail page MUST show the per-question scores for the selected category and a "View full transcript" link. (US3)
- **FR-011:** System MUST use the existing ModelSelector component for model selection with platform defaults. (US1)
- **FR-012:** All pages MUST be admin-only and accessible under the /archive path. (US1, US2, US3)
- **FR-013:** System MUST use analysisPlan.kind = "full_pvq" to distinguish Full PVQ surveys from legacy surveys. The createFullPvq mutation MUST enforce this value; no other code path sets it. (US1)
- **FR-014:** Results page MUST support filtering by framing via a toggle (Straight / Desire for Human); switching reloads the grid using only trials from that framing. (US2)
- **FR-015:** URL routes MUST encode all state needed to reconstruct the page without client-side session state: /archive/full-pvq-results?surveyId=X&framing=Y and /archive/full-pvq-cell?surveyId=X&framing=Y&category=Z&modelId=W. (US2, US3)
- **FR-016:** Survey list page MUST show trial counts broken down by framing (e.g., "12 Straight / 8 Desire for Human") to avoid ambiguity. The list page MUST NOT imply the survey itself has a single framing — both framings are always available per survey. (US4)
- **FR-017:** Run creation UI MUST expose a `samplesPerScenario` input (integer ≥ 1, default 1) so admins can control the number of trials per model in a single run. (US1)

---

## Schwartz Category → Question Mapping

| Category | Questions |
|---|---|
| Self-Direction | Q1, Q11, Q22, Q34 |
| Stimulation | Q6, Q15, Q30 |
| Hedonism | Q10, Q26, Q37 |
| Achievement | Q4, Q13, Q24, Q32 |
| Power | Q2, Q17, Q39 |
| Security | Q5, Q14, Q21, Q35 |
| Conformity | Q7, Q16, Q28, Q36 |
| Tradition | Q9, Q20, Q25, Q38 |
| Benevolence | Q12, Q18, Q27, Q33 |
| Universalism | Q3, Q8, Q19, Q23, Q29, Q40 |

---

## Success Criteria

- **SC-001:** An admin can create a Full PVQ survey, start a run, and see results on the results page in a single session without errors.
- **SC-002:** The results grid correctly shows mean category scores that match manually computed averages from the raw trial data.
- **SC-003:** A model that refuses (any missing Q score in any trial) has that trial excluded from its averages; a model with all trials refused is excluded from the grid.
- **SC-004:** Trials from two separate runs against the same survey + framing appear combined on the results page.
- **SC-005:** The trial detail page for a cell lists every trial (clean and refused) with correct per-category Q scores.

---

## Key Entities

**FullPvqSurvey** (stored as Experiment with analysisPlan.kind = "full_pvq")
- name: string
- questions: Q1–Q40 text (hardcoded in API, stored in analysisPlan for reference)
- createdAt: timestamp
- deletedAt: timestamp | null (soft delete)

**FullPvqRun** (stored as Run)
- surveyId: string (experimentId)
- framing: "straight" | "desire_for_human"  ← framing lives here, not on the survey
- models: string[] (selected model IDs)
- samplesPerScenario: number
- status: "pending" | "running" | "completed" | "failed"

**FullPvqTrial** (one per model per samplesPerScenario per run — stored as Transcript)
- modelId: string
- runId: string
- surveyId: string
- framing: "straight" | "desire_for_human" (denormalized from run for query efficiency)
- scores: Record<"Q1"…"Q40", number | null>
- refused: boolean (true if any score is missing, non-numeric, or out-of-range)
- parseWarnings: string[] (e.g. "Duplicate Q5 detected — used last occurrence")
- createdAt: timestamp

**FullPvqCategoryResult** (derived — computed at query time, not stored)
- category: string (one of 10 Schwartz categories)
- modelId: string
- mean: number | null
- trialCount: number (non-refused trials only)
- refusedCount: number

---

## Assumptions

1. Framing is per-run, not per-survey. A survey holds questions only.
2. Model picker reuses existing ModelSelector component with defaults.
3. All 40 questions sent in one prompt per model (samplesPerScenario controls number of trials).
4. Refusal = any missing, non-numeric, or out-of-range score; that trial excluded; model excluded from grid only if all its trials refuse.
5. Results aggregate across ALL runs ever for a given survey + framing combination (explicit product decision).
6. Results display: Schwartz category averages only (mean, one decimal), no variance, categories as rows × models as columns.
7. Cell click navigates to a separate page (not modal) showing all trials for that category × model.
8. Trial detail page: scrollable list, refused trials shown greyed out, parse warnings shown inline, View full transcript link, no pagination for v1 (~50 trial ceiling).
9. Admin-only, routes under /archive: /archive/full-pvq, /archive/full-pvq-results?surveyId&framing, /archive/full-pvq-cell?surveyId&framing&category&modelId.
10. analysisPlan.kind = "full_pvq", new createFullPvq mutation and fullPvqSurveys/fullPvqResults queries.
11. Score parsing done server-side from transcript text (regex on "Q1: N" pattern).
12. FullPvqCategoryResult is computed at query time from transcripts; no separate aggregation table needed for v1.
13. The 40 PVQ question texts are hardcoded in the API (not user-editable in v1).

---

## Residual Risks

1. **Aggregation across time conflates methodology changes.** If the prompt template is changed between runs, old and new data will be mixed. This is a design limitation — the system cannot detect that two runs used semantically different prompts. Mitigation: admins must create a new survey if the prompt changes. No system-level enforcement exists in v1. Future work: hash the prompt template per run and partition results by hash.

2. **Compute-on-read will not scale beyond ~200 trials.** FullPvqCategoryResult is derived at query time. Beyond a few hundred trials per survey, query latency will increase. Accepted for v1; aggregation caching or a materialized view is a natural follow-on.

3. **Mean-only display hides distribution.** A model scoring 1 half the time and 5 the other half looks identical to one scoring 3 consistently. Variance display is a natural follow-on.

4. **No pagination on trial detail page.** Accepted for v1 at ~50 trial ceiling. Will need pagination once trial volume grows.
