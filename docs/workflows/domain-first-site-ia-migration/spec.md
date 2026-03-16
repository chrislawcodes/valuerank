# Domain-First Site IA Spec

Generated: 2026-03-15

## Goal

Turn ValueRank into a domain-first product that matches the actual research workflow without breaking habitual use, deep links, or historical interpretation.

The target experience should make this loop legible:

1. frame a domain
2. assemble the instrument
3. pilot and tune vignettes
4. run a domain evaluation
5. interpret findings
6. validate methodology when needed

This spec defines user-facing behavior. Migration sequencing, backend constraints, and rollout guardrails live in [domain-first-site-ia-plan.md](/Users/chrislaw/valuerank/docs/plans/domain-first-site-ia-plan.md).

## Why This Spec Exists

The migration plan is now strong as architecture, phasing, and risk management, but it is still too high-level to implement directly. This spec exists to answer:

1. what users see and do on each major surface
2. which entry point is canonical for each task
3. which labels appear in the product
4. how lifecycle and readiness states behave
5. what makes a surface acceptable to ship

## Assumptions

1. The product is already in active internal use.
2. Existing routes and old object-first habits must remain compatible during migration.
3. The backend continues to persist vignette-scoped `Run` records in early phases.
4. `Domain Evaluation` is the user-facing term for the domain-wide action that launches work across multiple vignettes.
5. `Run` remains the term for the persisted vignette-scoped execution record.
6. `Experiment` is deprecated as a first-class navigation model and retained only as a legacy compatibility concern during migration.
7. The repo-local feature-workflow wrapper is incomplete in this checkout, so the workflow is being advanced through the expected artifact set plus repo-compatible review tooling.
8. Per-wave diff reviews should use wave-scoped artifacts by default so review findings stay aligned to the current implementation slice.

## Product Vocabulary

These terms should appear consistently in the UI:

1. `Domain`
   - the research program
2. `Vignette`
   - one instrument component within a domain
3. `Domain Evaluation`
   - one user action that launches work across multiple vignettes in a domain
4. `Run`
   - one persisted vignette-scoped execution record
5. `Batch`
   - one complete pass through all planned conditions for one vignette by one model
6. `Trial`
   - one model answering one condition once
7. `Diagnostics`
   - instrument-focused analysis used for tuning or validity checks
8. `Findings`
   - auditable domain interpretation
9. `Validation`
   - methodology reference plus cross-domain check reporting
10. `Archive`
   - historical or retired research surfaces

## Top-Level IA

The primary navigation should be:

```text
ValueRank
|
|-- Home
|-- Domains
|-- Validation
|-- Archive
|-- Settings
```

### Top-Level Intent

1. `Home`
   - resume work
   - notice completed, failed, or stalled work
   - jump into active domains quickly
2. `Domains`
   - primary active workspace
3. `Validation`
   - methodology reference and cross-domain reporting
   - not the primary execution home
4. `Archive`
   - historical work only
5. `Settings`
   - utility and admin surfaces

## Canonical Entry Points

Each major task needs one canonical home.

1. Create a vignette
   - canonical: `Domains > Vignettes`
   - secondary: `Overview` checklist or deep link
2. Create or select setup assets
   - canonical: `Domains > Setup`
3. Launch a pilot or production evaluation
   - canonical: `Domains > Runs`
4. Inspect run-scoped diagnostics
   - canonical: `Domains > Runs`
5. Inspect vignette diagnostic history
   - canonical shortcut: `Domains > Vignettes`
6. Inspect diagnostic evidence for a finding
   - canonical shortcut: `Domains > Findings`
7. Edit a vignette after diagnosing a problem
   - canonical: vignette editor deep link from diagnostics
8. Re-run one vignette quickly
   - canonical shortcut: `Re-run this vignette`
   - behavior: opens the launcher with that vignette preselected
9. Read auditable interpretation
   - canonical: `Domains > Findings`
10. Launch or review validation checks
   - canonical execution: `Domains > Runs`
   - canonical cross-domain reporting: `Validation`

The product should not make multiple generic, unlabeled routes to the same task feel equally primary.

## Domain Workspace

Each domain should expose this structure:

```text
Domain Workspace
|
|-- Overview
|-- Vignettes
|-- Setup
|-- Runs
|-- Findings
```

### Overview

Purpose:

1. orient a returning user
2. surface readiness at the vignette or cohort level
3. show exact next actions

Must include:

1. domain summary
2. readiness by vignette or vignette cohort
3. recent activity
4. needs-attention items
5. direct deep links to the exact object or flow requiring action

Recommendation cards must not dump the user into a generic tab. Each card must link to a specific vignette, run, evaluation summary, or launcher state.

### Vignettes

Purpose:

1. create and edit vignettes
2. inspect per-vignette readiness
3. inspect effective configuration
4. act quickly after diagnostics

Must include:

1. guided vignette creation
2. effective per-vignette setup
3. inheritance and override state
4. diagnostic history shortcut
5. `Edit this vignette`
6. `Re-run this vignette`
7. archive action for long-lived domains

### Setup

Purpose:

1. define domain defaults
2. manage setup assets
3. review override coverage

Must include:

1. preambles
2. contexts
3. value statements
4. level presets
5. domain defaults
6. override coverage review

### Runs

Purpose:

1. launch work
2. monitor work
3. inspect run-scoped diagnostics

Must include:

1. `Domain Evaluation Summary`
2. grouped vignette runs
3. run launcher
4. setup summary step in the launcher
5. cost estimate with confidence labeling
6. run detail
7. canonical diagnostics entry point

### Findings

Purpose:

1. interpret auditable domain results
2. compare runs
3. inspect diagnostic evidence without losing scope

Must include:

1. domain findings
2. dominance and coverage views
3. cross-run comparison
4. diagnostic evidence links labeled by scope
5. an explicit non-auditable state when only pilot or otherwise insufficient data exists

## Guided Vignette Creation

Creating a vignette should never dead-end because required setup assets are missing.

The product must support:

1. inline asset creation where practical
2. or a preflight state that tells the user exactly what is missing
3. direct links into the specific Setup subsection needed

Minimum user experience:

1. user clicks `Create vignette`
2. if required setup is missing, the user sees:
   - what is missing
   - why it is required
   - where to create it
3. after creating the missing asset, the user can return to the draft vignette flow without losing context

## Setup vs Vignette Configuration

The UI must make this split explicit:

1. `Setup`
   - manages domain defaults and domain-level selections
2. `Vignettes`
   - shows effective per-vignette configuration
   - shows whether each setting inherits or overrides the default

Users must always be able to answer:

1. what is the domain default?
2. which vignettes inherit it?
3. which vignettes override it?

### CRUD Contract

The UI must explain what kind of change the user is making:

1. `Edit`
   - change the targeted source asset
2. `Attach`
   - associate an existing asset version without mutating the source
3. `Fork`
   - create a local copy or override

At creation time, the product must state whether the new asset is:

1. added to this domain's setup
2. added to the global asset library
3. created as a local fork

### Override Coverage

Before a user launches a domain evaluation, the product must make override coverage visible in two places:

1. full review in `Setup`
2. summary review inside the launch flow

Users should be able to see:

1. how many vignettes inherit defaults
2. how many override them
3. which vignettes override them

## Vignette Lifecycle

Vignettes use these states:

1. `Draft`
   - no domain assigned yet
2. `Unready`
   - assigned to a domain but missing required setup or approval for the next step
3. `Ready for pilot`
   - eligible for pilot execution
4. `Ready for production`
   - eligible for production evaluation
5. `Archived`
   - intentionally excluded from readiness calculations and launch recommendations

### Transition Rules

The `Ready` transition uses a prompted model:

1. `Draft -> Unready`
   - when assigned to a domain
2. `Unready -> Ready for pilot`
   - prompted once required setup is present
3. `Ready for pilot -> Ready for production`
   - prompted once the pilot has been reviewed and the user confirms production readiness
4. `Ready for pilot` or `Ready for production -> Unready`
   - automatic if required setup becomes invalid or materially changes
5. `Any non-archived state -> Archived`
   - explicit user action only

The UI should not silently promote a vignette into launch readiness without user confirmation.

## Domain Evaluation Launch Flow

The launch flow must appear in `Domains > Runs`.

Sequence:

1. choose evaluation scope
   - pilot
   - production
   - validation check where applicable
2. choose vignette set
   - one vignette
   - ready cohort
   - custom subset
3. review setup summary
   - defaults
   - overrides
   - warnings
4. review estimated cost
   - estimate value
   - confidence label
   - fallback warning if estimate quality is weak
5. confirm launch
6. open `Domain Evaluation Summary`

The configuration coverage review must not live only in `Setup`. It must be surfaced inside this launch flow.

## Status Surfaces

The product needs three distinct status surfaces:

1. `Domain Evaluation Summary`
   - authoritative status page for one domain-wide evaluation cohort
2. `Run Detail`
   - status and analysis for one vignette-scoped run
3. `Global Status Center`
   - cross-domain operational visibility for in-flight and recent work

These surfaces must not be conflated.

### Domain Evaluation Summary

Must show:

1. evaluation scope
2. target domain
3. grouped vignette runs
4. aggregate status counts
5. failures, stalls, and warnings
6. links to individual run detail pages

### Global Status Center

Must be:

1. visible when a user launches work
2. easy to reopen later
3. explicit about its scope

It must not be presented as the authoritative view for a single evaluation if it is actually showing broader system activity.

## Diagnostics Scope

Diagnostics can be reached from multiple surfaces, but the scope must be explicit.

1. From `Runs`
   - label: `View diagnostics for this run`
   - scope: one run
2. From `Vignettes`
   - label: `View diagnostic history`
   - scope: one vignette across runs
3. From `Findings`
   - label: `View supporting diagnostics`
   - scope: evidence linked from a findings context

The product must not use three generic `Diagnostics` entry points that imply identical scope.

## Findings Eligibility

`Findings` is the interpretation surface, not the generic name for all analysis.

Findings are eligible only when the underlying data is auditable enough for interpretation. Until then, the surface must show an explicit non-auditable state.

Required message content:

1. this surface is not ready for domain claims yet
2. why it is not ready
   - pilot-only data
   - insufficient production data
   - incomplete snapshot support
3. what the user should do next

Minimum state copy:

```text
Findings are not ready yet. The current data is for tuning or validation only, not for domain-level claims. Complete a production Domain Evaluation with auditable snapshots to unlock findings.
```

## Validation

`Validation` is not the primary execution home.

It should contain:

1. methodology reference
2. shared check definitions or templates
3. cross-domain validation reporting

Execution of domain-scoped validation checks still starts from `Domains > Runs`.

## Archive

`Archive` is for past or retired work only.

It should contain:

1. past survey work
2. past survey results
3. retired studies
4. legacy research surfaces

Active work should not be filed here.

## Return-State Behavior

The product must support users coming back after time away.

### Home

Must surface:

1. recently completed evaluations
2. failed or stalled work
3. domains needing attention
4. resume shortcuts

### Domain Overview

Must surface:

1. most recent evaluation activity
2. unfinished or invalidated vignette work
3. the exact object that needs attention
4. the most relevant resume link

The product should answer:

1. what finished while I was away?
2. what failed?
3. what should I do next?

## Active-Run Edit Rule

Vignettes remain editable even if an active run already uses them, but the UI must say clearly that active runs continue using the launch snapshot.

Required behavior:

1. editing is allowed
2. active run behavior does not change
3. the vignette editor and relevant run surfaces state that active work uses the pre-edit snapshot

## Route Compatibility

The migration must preserve old routes during transition.

Required artifacts:

1. canonical route
2. alias route if needed
3. redirect behavior
4. sunset rule

The workflow plan owns the route compatibility matrix. This spec only requires that route migration not strand habitual users or shared links.

## Acceptance Criteria

1. The product exposes `Home`, `Domains`, `Validation`, `Archive`, and `Settings` as the intended top-level structure.
2. Each domain exposes `Overview`, `Vignettes`, `Setup`, `Runs`, and `Findings`.
3. `Runs` is the canonical launch and run-scoped diagnostics home.
4. `Findings` is the canonical interpretation surface.
5. Guided vignette creation prevents missing-setup dead ends.
6. `Setup` and `Vignettes` clearly distinguish domain defaults from per-vignette overrides.
7. The launch flow includes setup summary and cost estimation before confirmation.
8. Launching opens a `Domain Evaluation Summary`, not an arbitrary single run.
9. Diagnostics shortcuts are scope-labeled by entry point.
10. Vignette readiness uses the prompted transition model defined above.
11. The non-auditable findings state uses explicit explanatory copy.
12. `Validation` is reference/reporting oriented while domain-scoped validation execution remains accessible from `Runs`.
13. `Archive` clearly reads as historical work, not active workspace.
14. Home and Overview support return-after-break behavior.
15. The UI consistently uses the vocabulary defined in this spec.

## Non-Goals

1. immediate backend normalization of every current concept
2. big-bang route replacement
3. globally shared contexts or value statements before schema support exists
4. perfectly accurate realized-cost prediction in early phases
5. removing every old page before compatibility paths exist
