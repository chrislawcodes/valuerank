# Plan: Replace Legacy decisionCode in Domain Analysis

**Feature run:** `replace`
**Status:** ready-to-implement
**Last updated:** 2026-03-25

---

## Overview

Single wave. All changes are tightly coupled (backend types → GraphQL schema → frontend
types → UI rendering) and can't ship independently without breaking the build.
No DB migrations. No Python workers.

---

## Wave 1 — Canonical Decision Model End-to-End

**Branch:** `wave/replace-canonical-decisions`

### What it does

1. Fixes a bug in `decision-model.ts` that causes job-choice transcripts to resolve as
   `unknown` when `orientationFlipped` is null.
2. Replaces the `decisionCode` integer aggregation in `domainAnalysisValueDetail` with
   canonical decision resolution.
3. Adds `opponentMeanPreferenceScore` alongside `meanPreferenceScore` so the UI can
   show the winner's score (not always 0 when the opponent wins).
4. Updates the GraphQL type registration, web query, and condition matrix UI.

### Files

**Backend:**
- `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` — bug fix only
- `cloud/apps/api/src/graphql/queries/domain/shared.ts` — type + remove classifyDecisionForSelectedValue
- `cloud/apps/api/src/graphql/queries/domain/analysis.ts` — resolver changes
- `cloud/apps/api/src/graphql/queries/domain/types.ts` — GraphQL field registration

**Frontend:**
- `cloud/apps/web/src/api/operations/domainAnalysis.ts` — query + TypeScript types
- `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx` — condition matrix UI

### Do NOT touch
- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`
- `aggregateValueCountsFromTranscripts` in `shared.ts` (feeds the top-level domain analysis grid)
- Any Python workers, export endpoints, MCP tools
- `DomainAnalysisValueScore` type (top-level grid stays on legacy counts this wave)

### Removed symbols
- `classifyDecisionForSelectedValue` (deleted from `shared.ts`)
- `meanDecisionScore` (removed from type, GraphQL schema, query, and UI)
- `MutableCondition.decisionSum` (removed from `analysis.ts` local type)

### Risk
Medium. Pure read-path change — no data mutations. The build will fail if any of the
removed symbols are referenced anywhere not covered by the scope, so the verification
step is critical.

### Verification
```bash
cd /Users/chrislaw/valuerank/cloud
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

---

## Spec Review Reconciliation

### spec.gemini.requirements-adversarial

**Finding 1 — Incorrect UI logic for opponent scores:**
RESOLVED. Added `opponentMeanPreferenceScore` to the condition type. The UI now
displays the winner's score using `opponentMeanPreferenceScore` when the opponent
leads and `meanPreferenceScore` when the selected value leads.

**Finding 2 — Inconsistent metrics across the app:**
ACCEPTED. The top-level grid stays on legacy counts this wave by design. The detail
page moves first. A follow-up wave aligns the top-level grid. This is the explicit
two-wave strategy noted in "Not In This Plan".

**Finding 3 — Silent data loss from dropped transcripts:**
ACCEPTED AS KNOWN. Transcripts with `decisionMetadata` that can't be resolved will
count as `unknownCount` and be surfaced to the user. This is strictly better than the
current behavior where `decisionCode`-only transcripts are excluded silently. Any
transcript that previously had `decisionCode` but no `decisionMetadata` will shift to
`unknownCount` instead of being counted. That count is now visible in the UI.

**Finding 4 — Misleading tie-break display:**
ACCEPTED with explicit convention. Ties render orange (opponent). This is defined
explicitly in the spec so the behavior is intentional, not a bug.

### spec.gemini.ambiguity-adversarial

See `reviews/spec.gemini.ambiguity-adversarial.review.md` — no blocking ambiguities;
all design decisions are explicit in spec.md.

### spec.codex.feasibility-adversarial

**Finding 1 — Shared aggregation breakage:**
RESOLVED. `aggregateValueCountsFromTranscripts` is explicitly NOT changed this wave.
Only the `domainAnalysisValueDetail` per-transcript loop is rewritten.

**Finding 2 — Cell color logic:**
RESOLVED. Added `opponentMeanPreferenceScore`; direction is now derived from which
score is higher, not a count comparison.

**Finding 3 — Safe to drop decisionCode filter:**
ACCEPTED. Unknown transcripts are excluded and counted in `unknownCount`.

**Finding 4 — orientationFlipped for standard-parser:**
ACCEPTED. Standard-parser vignettes without `orientationFlipped` will resolve as
`unknown` and show in `unknownCount`. All current production batches are job-choice-v2.

**Finding 5 — unknownCount at aggregate level:**
NOTED. Condition-level `unknownCount` is the scope for this wave. Vignette/pair level
summaries are not changed.

---

## Not In This Plan

- Top-level domain analysis grid counts (follow-up wave)
- Scenarios tab on AnalysisDetail page (follow-up wave — must produce identical
  cell display: 0–2 decimal, blue/orange per value name, same bucket definitions)
- Export surfaces, workers, MCP tools
