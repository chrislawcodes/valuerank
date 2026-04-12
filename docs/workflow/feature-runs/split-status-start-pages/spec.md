# Spec: Split Status and Start Pages

**Slug:** split-status-start-pages
**Status:** Draft
**Scope paths:** `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx`, `cloud/apps/web/src/pages/Domains.tsx`, `cloud/apps/web/src/components/domains/domainTrials/`, `cloud/apps/web/src/App.tsx`

## Summary

The current `DomainTrialsDashboard` (873 lines) combines three responsibilities: launching new domain evaluations, monitoring run status, and backfilling missing models. This spec splits the page into two focused pages and eliminates the standalone backfill UI by reusing the launch page with prefilled inputs.

## Non-goals

- Adding a domain selector to the Start or Status pages (user navigates via Domains overview).
- Showing a mini status summary on the Start page.
- Adding "Start Batches" to the nav sidebar.
- Unifying the vignette-level `StartPairedBatchPage` with the domain-level Start page. These are different operations (standalone run vs domain evaluation) and stay separate.

## User Stories

### US-1: Launch domain evaluations from a dedicated Start page (P1)

As a researcher, I want the launch controls on their own page so I can configure and start a domain evaluation without the status tables distracting me.

**Why P1:** This is the core page split. Without it, the pages stay combined.

**Independent test:** Navigate to `/domains/:domainId/start`. Configure batch count, budget cap, and temperature. Launch. Verify the page contains only launch controls (no status panel, no backfill section).

**Acceptance scenarios:**

1. **Given** a domain with vignettes and active models, **When** user navigates to `/domains/:domainId/start`, **Then** they see `LaunchControlsPanel` and can configure batch count, budget cap, temperature, and see cost estimates.
2. **Given** the user clicks "Review & Start Paired Batches," **When** they confirm in `LaunchConfirmModal`, **Then** the `startDomainEvaluation` mutation fires and the user is redirected to `/domains/:domainId/status?evaluationId=<new-id>`.
3. **Given** the user is on the Start page, **Then** there is no status panel, no backfill section, and no polling.

### US-2: Monitor evaluations on a dedicated Status page (P1)

As a researcher, I want a focused status page so I can track live, failed, and completed runs without the launch form cluttering the view.

**Why P1:** This is the other half of the core page split.

**Independent test:** Navigate to `/domains/:domainId/status`. Verify live runs poll at 5-second intervals. Click a run row to open the detail drawer.

**Acceptance scenarios:**

1. **Given** a domain with existing evaluations, **When** user navigates to `/domains/:domainId/status`, **Then** they see `DomainEvaluationStatusPanel` with live/exception/completed sections.
2. **Given** live runs exist, **Then** the page polls at 5-second intervals.
3. **Given** a run row is clicked, **Then** `DomainEvaluationStatusDrawer` opens with per-model detail.
4. **Given** the user navigates to `/status`, **Then** `StatusRedirect` sends them to `/domains/:domainId/status` (not `/run-trials`).

### US-3: Fill model gaps via prefilled Start page (P1)

As a researcher, when I notice a model has incomplete coverage on the Status page, I want to click a link that takes me to the Start page prefilled with the right context so I can fill the gap without configuring everything from scratch.

**Why P1:** This replaces the confusing backfill UI. Without it, users lose the ability to fill model gaps after the old backfill section is deleted.

**Independent test:** On the Status page, find an evaluation with incomplete model coverage. Click the "Fill gap" link. Verify the Start page opens prefilled with the evaluation ID, model, and target depth. Submit and verify `backfillDomainEvaluationModels` mutation fires.

**Acceptance scenarios:**

1. **Given** an evaluation where a model has fewer completed batches than the target, **When** the Status page renders, **Then** a "Fill gap" link appears for that model pointing to `/domains/:domainId/start?evaluationId=<id>&models=<modelId>&depth=<target>`.
2. **Given** the Start page is opened with `evaluationId` in URL params, **When** the page loads, **Then** the form is prefilled with the backfill context and a banner explains the scope (e.g., "Filling gap for GPT-4o in evaluation abc123").
3. **Given** the user confirms a prefilled backfill launch, **Then** the page calls `backfillDomainEvaluationModels` (not `startDomainEvaluation`) and redirects to the Status page with the evaluation highlighted.
4. **Given** the user adjusts the batch depth before confirming, **Then** the adjusted depth is used. Model selection and evaluation context remain read-only in backfill mode.

### US-4: Update Domains overview link (P2)

As a researcher, I want the "Add Paired Batches for all Vignettes" button on the Domains overview to link to the new Start page.

**Why P2:** The old link target (`/domains/:domainId/run-trials`) will be removed. This keeps the entry point working.

**Acceptance scenarios:**

1. **Given** the Domains overview page with a selected domain, **When** the user clicks "Add Paired Batches for all Vignettes," **Then** they navigate to `/domains/:domainId/start`.

### US-5: Clean up old route and backfill code (P2)

As a developer, I want the old combined page, the standalone backfill UI, and the `/run-trials` route removed so the codebase stays clean.

**Why P2:** Cleanup. The app works without this if old routes redirect, but dead code creates confusion.

**Acceptance scenarios:**

1. **Given** a user navigates to `/domains/:domainId/run-trials`, **Then** they are redirected to `/domains/:domainId/status`.
2. **Then** `BackfillConfirmModal.tsx` is deleted.
3. **Then** all backfill-specific state and logic is removed from the codebase (backfill candidate calculation, backfill coverage counting, backfill blocked-reason handling).
4. **Then** `DomainTrialsDashboard.tsx` no longer exists (split into the two new pages).

## Functional Requirements

- **FR-001:** The route `/domains/:domainId/start` MUST render a page with `LaunchControlsPanel`, `LaunchConfirmModal`, and the `startDomainEvaluation` mutation. No polling. No status display.
- **FR-002:** The route `/domains/:domainId/status` MUST render a page with `DomainEvaluationStatusPanel`, `DomainEvaluationStatusDrawer`, 5-second polling for live runs, and "fill gap" links for models with incomplete coverage.
- **FR-003:** The Start page MUST accept URL search params `evaluationId` (single ID), `models` (comma-separated model IDs), and `depth` (single integer). When `evaluationId` is present, the page MUST operate in backfill mode: prefill the form, show a contextual banner, and call `backfillDomainEvaluationModels` on submit. In backfill mode, the model selection and evaluation context are read-only (not user-adjustable); only the batch depth is editable.
- **FR-003a:** In backfill mode, the Start page MUST validate that the `evaluationId` belongs to the `:domainId` in the URL path. If they do not match, the page MUST show an error and fall back to fresh-launch mode.
- **FR-004:** After a successful launch (fresh or backfill), the Start page MUST redirect to `/domains/:domainId/status?evaluationId=<id>`.
- **FR-005:** `StatusRedirect` (`/status`) MUST redirect to `/domains/:domainId/status`, where `domainId` is determined by the existing `useDomains()` hook (first domain in the user's list). This matches current behavior.
- **FR-006:** The route `/domains/:domainId/run-trials` MUST redirect to `/domains/:domainId/status` for backward compatibility, preserving any existing query parameters (e.g., `?evaluationId=abc`).
- **FR-007:** The Domains overview "Add Paired Batches for all Vignettes" button MUST link to `/domains/:domainId/start`.
- **FR-008:** The existing `StartPairedBatchPage` (vignette-level, `/definitions/:id/start-paired-batch`) MUST NOT be changed.
- **FR-009:** `BackfillConfirmModal.tsx` MUST be deleted. All backfill-specific state (candidate calculation, coverage counting, blocked-reason logic) MUST be removed from the dashboard code.
- **FR-010:** The Status page MUST compute which models have incomplete coverage for the current evaluation. This is a simplified version of the old backfill candidate logic — it only needs to determine whether a model has fewer completed batches than the target, and produce a "fill gap" link with the appropriate URL params. The detailed backfill cost estimation and blocked-reason logic are NOT needed on the Status page (those live on the Start page in backfill mode).
- **FR-011:** Each "fill gap" link on the Status page targets a single model. Multi-model backfill is not a UI requirement (the `models` param supports comma-separated values for future use, but the Status page always generates single-model links).

## Edge Cases

- **No evaluations exist for domain:** Status page shows an empty state. No "fill gap" links.
- **Evaluation has no missing models:** No "fill gap" links for that evaluation.
- **Model in URL params is no longer active:** In backfill mode, the Start page shows a warning but still allows submission — the API already handles inactive model validation and will reject if truly unsupported. In fresh-launch mode, inactive models are not selectable.
- **evaluationId in URL params points to a deleted/invalid evaluation:** Start page shows an error and falls back to fresh-launch mode.
- **evaluationId belongs to a different domain than the URL path domainId:** Start page shows an error and falls back to fresh-launch mode.
- **User manually edits URL params to invalid values:** Start page validates params on load and shows appropriate errors or ignores invalid values.

## Success Criteria

- **SC-001:** `DomainTrialsDashboard.tsx` (873 lines) is replaced by two page files, each under 400 lines per the project constitution.
- **SC-002:** The backfill UI (120+ lines of JSX, BackfillConfirmModal component, and ~150 lines of backfill state/logic) is eliminated.
- **SC-003:** All existing launch and monitoring functionality remains accessible — no regression.
- **SC-004:** Build passes (`npm run build` for web workspace). Tests pass. Lint passes.

## Assumptions

- The `backfillDomainEvaluationModels` API mutation and the `startDomainEvaluation` mutation both remain unchanged on the API side. This is a frontend-only change.
- The existing `LaunchControlsPanel`, `LaunchConfirmModal`, `DomainEvaluationStatusPanel`, and `DomainEvaluationStatusDrawer` components are reused as-is (possibly with minor prop changes).
- The `launch-state.ts` helper module is shared between both pages unchanged.
