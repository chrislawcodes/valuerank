# Domain-First Site IA Migration Plan

Generated: 2026-03-15

## Goal

Restructure the ValueRank web IA so the site matches the real research workflow:

1. come up with a domain idea
2. assemble a domain-level test setup
3. run a small pilot to validate the instrument
4. inspect vignette-level analysis and tune wording
5. run full-domain production runs
6. analyze domain-level results
7. run repeated production runs for confidence
8. re-analyze domain-level results across runs

The site should feel domain-first, not artifact-first.

## Problem Summary

The current product exposes too much of the internal machinery as peer-level navigation:

1. `Vignettes`, `Domains`, `Trials`, `Analysis`, `Compare`, `Survey`, and `Assumptions` read like parallel tools rather than one staged workflow.
2. setup assets such as preambles, contexts, and value statements are too detached from the domain work they support.
3. vignette-level analysis and domain-level findings are too easy to blur together, even though they answer different questions.
4. survey work and methodology checks compete with the primary domain workflow for top-level attention.

This makes the product feel more like a toolkit than a coherent research workspace.

## Context

### Terminology Dependency

The repo references a canonical glossary file at `docs/canonical-glossary.md`, but that file is not currently present in this checkout. This plan has been aligned against the glossary text recovered from local git history plus the current repo terminology notes.

Until the glossary is restored to the checked-out tree, terminology should be aligned against:

1. the canonical glossary text from repo history
2. `cloud/CLAUDE.md` terminology note
3. existing product semantics docs such as vignette-analysis and assumptions plans
4. the terminology decisions locked in Phase 0 of this plan

This plan should not be treated as the glossary itself. Phase 0 should restore `docs/canonical-glossary.md` to the repo or explicitly replace it with a new checked-in source of truth.

This plan is specifically aligned to the glossary on these points:

1. `definition` maps to `vignette`
2. `dimension` maps to `attribute`
3. `scenario` should be resolved as `condition` or `narrative` by meaning, not blind rename
4. `run` is the persisted execution record
5. in the current backend, a `run` is scoped to a single vignette
6. the user-facing term for a domain-wide execution should be `Domain Evaluation`
7. a `Domain Evaluation` may create many vignette-scoped runs
8. `batch` is one complete pass through all planned conditions for a vignette by a model
9. `trial` is one model answering one condition once

### Real User Workflow

The intended user journey is:

1. create or refine a domain idea
2. build the initial domain setup:
   - preamble
   - context
   - value statements
   - initial vignette set
3. run a small pilot or test run
4. use vignette-level analysis to determine whether the instrument is behaving as intended
5. tune wording and construction inside the domain
6. run a larger production run through all vignettes in the domain
7. analyze domain-level findings
8. run additional production runs for confidence or significance
9. analyze domain-level findings again across multiple runs

### Product Semantics To Preserve

The IA should make these distinctions explicit:

1. `Domain` is the research program.
2. `Vignette` is an instrument component inside a domain.
3. `Run` is the persisted execution record for one vignette.
4. `Domain Evaluation` is the user-facing action that may create many vignette-scoped runs across one domain.
5. `Batch` is one complete pass where a model answers every planned condition for a vignette once.
6. `Trial` is one model answering one condition once.
7. `Vignette-level analysis` is primarily for instrument tuning and diagnostics.
8. `Domain-level findings` are primarily for interpretation and broader claims.
9. `Assumptions` and related checks are methodology validation, not domain findings.
10. survey work is valuable but should be treated as a secondary research program rather than a peer of the main domain workflow.
11. a domain may contain vignettes that are at different stages of readiness at the same time.

The UI should reserve `Run` for vignette-scoped execution records and use `Domain Evaluation` for the higher-level domain-wide action consistently.

### Backend Reality Check

The current backend imposes constraints that materially affect this migration:

1. `Run` rows are keyed to `definitionId`, not `domainId`
2. `runs(...)` filters support `definitionId` and `experimentId`, but not `domainId`
3. the backend does already support domain-wide launch workflows that create many vignette-scoped runs, but that is not the same thing as a true domain-run record
4. reusable asset support is uneven:
   - preambles and level presets are global/versioned today
   - domain contexts and value statements are domain-owned today
5. current snapshots are partial and do not yet guarantee full reproducibility for all mutable setup text
6. queue and status data are stronger at the individual run level than at the domain-evaluation cohort level
7. cost estimation exists, but today it is closer to probe-pass estimation than final realized spend
8. survey classification and some methodology exclusion rules still depend on conventions rather than first-class schema fields

Because of this, the plan must distinguish:

1. IA changes that can land immediately
2. UI flows that need new query capability
3. promises that must wait for schema changes

### Migration Compatibility Principle

This migration must preserve two kinds of truth during rollout:

1. `navigation truth`
   - where users go in the new IA
2. `historical truth`
   - what an old URL, old run, or old launch meant at the time it was created

The plan should never rely on mutable present-day relationships alone when reconstructing historical context.

### Why The Current IA Breaks Down

The current app teaches users to think in system objects:

1. create a vignette
2. start a run
3. open analysis

But the actual research job is:

1. define a domain
2. tune the instrument
3. run evaluations
4. interpret domain findings

The IA should therefore organize around the research job, while still preserving access to the underlying objects for power users.

## Design Principles

1. The site should be domain-first.
2. The primary workflow should be staged and legible.
3. Setup, execution, and findings should be separate states of work, but execution data should not be split into separate silos.
4. Vignette-level analysis should support tuning, not compete with domain findings.
5. Cross-cutting validity checks should live in a dedicated validation area while remaining reachable from domain context.
6. Reusable setup assets should support both global libraries and domain-local overrides.
7. Instrument snapshots must remain auditable across runs, batches, and findings.
8. Secondary or historical research work should remain accessible without dominating the main workflow.
9. Global utilities should exist where needed, and active monitoring tools should stay prominent.
10. The IA must support concurrent work states inside one domain, not just a single linear stage.
11. Users should understand estimated run cost and live run status before, during, and after launch.

## Proposed IA

### Top-Level IA

```text
ValueRank
|
|-- Home
|-- Domains
|-- Validation
|-- Archive
|-- Settings
```

### Top-Level Bucket Definitions

1. `Home`
   - recent domains
   - active runs / jobs
   - needs attention
   - quick-start entry points

2. `Domains`
   - all domains
   - create domain
   - asset library
   - drafts / unassigned work
   - domain workspace

3. `Validation`
   - assumptions and check reference
   - methodology definitions and guidance
   - shared check templates
   - cross-domain validation reporting where needed

4. `Archive`
   - past survey work
   - past survey results
   - retired studies
   - legacy or non-primary research surfaces

5. `Settings`
   - account
   - models
   - API keys
   - infrastructure

### Global Utilities

These should be globally reachable and prominent enough for active use:

1. active jobs / run monitor
2. compare / benchmark entry point
3. global search
4. notifications / failures needing attention
5. persistent status center for in-flight and recent runs

## Asset Ownership Model

Setup assets should not become domain-locked primitives.

Important backend constraint:

1. preambles and level presets already support global/versioned use
2. domain contexts and value statements are currently domain-owned in the schema
3. therefore `global library + domain attachment + local override` is a target state, not a Phase 1 assumption for every asset type

The future model should support:

1. global library assets
   - reusable preambles
   - reusable presets
2. future shared assets after schema work
   - reusable contexts
   - reusable value statements
3. domain attachments
   - a domain chooses which versioned global assets it uses
4. domain-local overrides
   - when a domain needs to fork an asset for tuning without mutating the shared source

Versioning rule:

1. domains attach to pinned asset versions, not to mutable live assets
2. a global asset update creates a new version rather than silently mutating attached domains
3. domains should see `update available` states and choose when to adopt the newer version
4. future runs should never drift because a shared asset changed elsewhere without an explicit adoption step

This avoids turning domain locality into copy-paste duplication.

## Asset Library And Drafts Model

The product should not conflate reusable assets with unprocessed work.

`Asset Library` should support:

1. curated reusable preambles
2. curated reusable presets
3. curated reusable contexts once schema support exists
4. curated reusable value statements once schema support exists
5. reusable vignette templates where appropriate

`Drafts / Unassigned` should support:

1. unassigned vignettes
2. work-in-progress setup assets not yet attached to a domain
3. intake workflows for newly created but not yet curated assets

The UX rule is:

1. `Library` means reusable and versioned
2. `Drafts / Unassigned` means work that still needs placement or curation

## Instrument Snapshotting Model

The future IA depends on an explicit snapshot concept.

Each run must preserve:

1. the vignette set used at launch
2. the resolved prompt inputs used at launch, not only foreign keys
3. the domain setup state associated with the execution event
4. judge / evaluator versioning relevant to analysis
5. model provider settings relevant to reproducibility

Important backend constraint:

1. current snapshots reliably capture vignette content and preamble linkage
2. current snapshots do not yet fully preserve all mutable setup text across contexts, value statements, and level wording
3. auditable cross-run findings must therefore be blocked on snapshot-boundary expansion, not just IA relabeling

Findings must then be able to answer:

1. which setup snapshot produced this run?
2. are these findings comparable across runs?
3. did the instrument change between replications?
4. did evaluation or model configuration change between replications?

## Run Launch, Cost, And Status Model

Starting a run should immediately answer three questions for the user:

1. what am I about to run?
2. what do we estimate it will cost?
3. where do I watch it progress after launch?

The future model should support:

1. a guided run launcher that explains run types in plain language:
   - pilot run
   - production run
   - replication run
   - diagnostic / validation run
2. pre-launch cost estimation using the best available backend inputs
3. explicit labeling of:
   - estimated cost before launch
   - actual cost as the run progresses
   - final realized cost when the run completes
4. a run-start confirmation state that immediately opens or offers:
   - the `Domain Evaluation Summary` when an evaluation creates multiple vignette runs
   - the run detail page when the launch creates one vignette-scoped run
   - the global status center as a secondary global monitor
5. a persistent status center that remains reachable after the user leaves the launch flow
6. clear failure and retry states so the status UI never implies false progress
7. a first-class `Domain Evaluation Summary` surface that is authoritative for:
   - all runs created by one launch action
   - grouped aggregate status
   - per-vignette drilldowns
   - launch-scoped cost preview vs realized cost

Important backend constraint:

1. current cost estimation is useful but incomplete for user-facing budget confidence
2. current estimate quality depends on fallback token stats more often than the eventual UX should imply
3. current realized cost may differ materially from estimates when evaluator, summarizer, retries, or provider behavior add work outside the probe-pass estimate
4. current ETA logic is not yet reliable enough to anchor the status experience on countdowns
5. current queue health is stronger globally and per-run than per domain-evaluation cohort
6. the first status center should therefore emphasize:
   - actual run state
   - completed / failed counts
   - suspect or stalled states
   - estimate confidence labeling
   over precise ETA promises

The product should treat these monitoring surfaces as distinct:

1. `Domain Evaluation Summary`
   - authoritative for one evaluation event across many vignette runs
2. `Run Detail`
   - authoritative for one vignette-scoped run
3. `Global Status Center`
   - cross-domain operational monitor, not the primary source for one launch cohort

## Domain Workspace Model

The domain workspace is the core product surface.

```text
Domain Workspace
|
|-- Overview
|-- Vignettes
|-- Setup
|-- Runs
|-- Findings
```

### Domain Workspace Sections

1. `Overview`
   - domain summary
   - readiness by vignette or vignette cohort
   - recent activity
   - open issues / next recommended action

2. `Vignettes`
   - vignette list and editing
   - guided vignette creation flow
   - vignette readiness state
   - effective per-vignette setup
   - per-vignette overrides with inheritance from domain defaults
   - vignette diagnostic history shortcuts
   - re-run this vignette shortcut
   - clone / attach / fork flows where needed

3. `Setup`
   - preamble library + domain selection
   - context library + domain selection
   - value statement library + domain selection
   - level preset library + domain selection
   - domain defaults
   - configuration coverage / override review before launch

4. `Runs`
   - domain evaluation history
   - domain evaluation summary
   - grouped vignette runs for this domain
   - pilot, production, replication, and diagnostic views once backend categorization exists
   - run launcher with run-type guidance
   - setup summary / configuration coverage review in the launch flow
   - pre-launch cost estimate
   - run history
   - run detail / execution monitoring
   - launch-triggered status screen / panel
   - batch summaries inside run detail where relevant
   - canonical run-scoped diagnostics entry point

5. `Findings`
   - domain findings for eligible production data
   - dominance and value-pattern views
   - coverage
   - cross-run comparison
   - interpretation notes / export surfaces
   - drilldowns to diagnostic evidence with explicit scope labels
   - explicit state when only pilot or otherwise non-auditable data exists

The non-auditable state should have required message content:

1. state clearly that the current view is not suitable for domain-level claims yet
2. explain why:
   - pilot-only data
   - missing production data
   - missing snapshot completeness
3. recommend the next action
4. link directly to that next action when possible

### Setup Vs Vignette Overrides

The plan should make the ownership model explicit:

1. `Setup`
   - sets domain defaults
   - manages asset libraries and domain-level selections
2. `Vignettes`
   - shows the effective configuration for each vignette
   - allows per-vignette overrides where the backend supports them
   - shows whether a vignette is inheriting the domain default or using an override

The CRUD contract should also be explicit:

1. `Edit`
   - changes the currently targeted source asset
2. `Attach`
   - associates an existing asset version to the current domain or vignette without mutating the source
3. `Fork`
   - creates a domain-local or vignette-local copy when a user needs a local change without affecting the shared source

Users should never have to guess whether they are editing a shared source, attaching an existing version, or creating a local override.

Users should always be able to tell:

1. what the domain default is
2. which vignettes inherit it
3. which vignettes override it

### Guided Vignette Creation

Creating a vignette should not require users to infer the Setup dependency chain.

The plan should support at least one of these patterns:

1. inline asset creation while creating a vignette
2. a guided preflight that says which setup assets are missing and links directly into the missing Setup step
3. an Overview checklist that blocks or warns when users try to create a vignette without required setup assets

The important UX rule is:

1. users should not be able to enter vignette creation and then discover too late that the required assets do not exist

### Vignette Lifecycle States

The product needs explicit lifecycle states that users can internalize:

1. `Draft`
   - no domain assigned yet
   - lives in `Domains > Drafts / Unassigned`
2. `Unready`
   - assigned to a domain but missing required setup or validation
   - appears in domain readiness views
3. `Ready`
   - eligible for the next explicitly defined launch step
4. `Archived`
   - intentionally excluded from readiness calculations and launch recommendations
   - not deleted

This avoids mixing "unfinished and not yet placed" with "part of the domain but not ready."

The transition rules are:

1. `Unready -> Ready`
   - prompted confirmation
   - the product prompts the user to mark the vignette ready only after required setup and validation conditions are satisfied
2. `Ready -> Unready`
   - automatic
   - if a required field, required asset assignment, or required validation becomes invalid again
3. `Any active state -> Archived`
   - explicit user action only
   - never automatic

The plan also distinguishes:

1. `Ready for pilot`
   - prompted once required setup is complete and blocking issues are cleared
2. `Ready for production`
   - prompted only after pilot review is complete and the user explicitly promotes the vignette for production use

Readiness counts and launch recommendations should never silently mix `Ready for pilot` and `Ready for production`.

### Domain Cleanup And Historical Scope

Long-lived domains need explicit cleanup rules.

The plan should support:

1. archiving vignettes without deleting them
2. excluding archived vignettes from readiness calculations and launch recommendations
3. distinguishing active runs from historical reference runs
4. defining a canonical findings set so `Findings` is not polluted by every exploratory or superseded run forever

### Transitional Analysis Labels

During migration, the product will have multiple legacy and new analysis entry points alive at the same time.

The plan should require temporary labels or banners that make scope explicit:

1. `Legacy Analysis`
   - old object-first analysis pages still reachable by deep link or transition route
2. `Diagnostics`
   - instrument-focused analysis
3. `Findings`
   - auditable domain interpretation
4. `Validation Reporting`
   - validation-specific reporting or checks

The important rule is:

1. users should never land on an analysis surface during rollout without being told which analysis world they are in and where the canonical successor lives

### Diagnostics Entry Point Contract

Diagnostics can be reached from multiple places, but they should not all imply the same scope.

The plan should define:

1. canonical entry point
   - `Runs`
   - this is where users go for run-scoped diagnostic inspection
2. contextual shortcut from `Vignettes`
   - labeled as diagnostic history for this vignette
3. contextual shortcut from `Findings`
   - labeled as diagnostic evidence for this finding

The important rule is:

1. no surface should use an unlabeled generic `Diagnostics` link if it is actually scoped to one run, one vignette history, or one finding drilldown

### Return State

The plan should explicitly define what a returning user sees after time away.

At minimum:

1. `Home`
   - recently completed launches and runs for a defined time window
   - failed or stalled work needing attention
   - a resume shortcut to the most relevant recent work
2. `Overview`
   - recent domain activity for a defined time window
   - the last important event in the domain
   - direct links back to finished, failed, or in-progress work

The time windows and display rules should be specified in the spec phase so the return experience is consistent.

### Active-Run Edit Rule

The plan should define what happens when a vignette is edited while an active run still references it.

The preferred rule is:

1. editing is allowed
2. the active run continues using the launch-time snapshot
3. the UI shows a persistent notice that the active run is using the pre-edit version

This prevents users from assuming an in-flight run reflects their newest edits.

### Launch Flow Sequence

The launch flow should be specified as an ordered sequence, not just a feature list.

At minimum the sequence should define:

1. when the user chooses launch scope and run type
2. when configuration coverage / setup summary is shown
3. when the cost estimate is shown
4. when warnings about overrides or non-default configuration appear
5. when the launch summary becomes available

Configuration coverage review should be part of the launch flow itself, not only a feature in `Setup`.

### Overview Actions

`Overview` should not show generic recommendation cards that dump users into a tab.

Each recommended action must deep-link to the exact object or workflow that needs attention:

1. specific vignette editor
2. specific diagnostic result
3. specific run
4. specific launch flow
5. specific setup asset or override review

### Domain-Scoped Validation Access

`Validation` should not become a second execution home for the same run objects.

The future split should be:

1. top-level `Validation`
   - shared check definitions
   - assumptions reference
   - shared validation templates
   - cross-domain validation reporting where useful
2. domain-scoped validation runs
   - created and monitored from `Domains > Runs`
   - labeled clearly as `diagnostic / validation run`
   - excluded from empirical findings by default

Each domain workspace should still expose entry points to the relevant methods material from:

1. `Overview`
2. `Runs`
3. `Findings`

This avoids forcing users to leave the domain context just to validate the current instrument.

### Validation Reporting Flow

The plan should explicitly describe how domain-scoped diagnostic runs feed any top-level validation reporting.

The intended rule should be:

1. method checks are launched and monitored from `Domains > Runs`
2. top-level `Validation` only shows aggregated or cross-domain reporting once those diagnostic runs have been ingested into a shared reporting view
3. users should never have to guess whether a newly completed diagnostic run should appear in `Validation` immediately, later, or not at all

If `Validation` is initially reference-heavy, the label should make that clear during rollout:

1. `Validation Reference`
2. `Checks & Validation`
3. another label with stronger information scent than `Validation` if testing shows confusion remains

### Global Asset Access

The site still needs a global way to create and manage reusable assets and unassigned work without blending them into one ambiguous surface.

`Domains > Asset Library` should support:

1. curated reusable setup assets that are genuinely global in the backend today
2. reusable vignette templates where appropriate

`Domains > Drafts / Unassigned` should support:

1. unassigned vignettes
2. work-in-progress setup assets
3. intake before curation or domain attachment

This prevents the migration from trapping assets inside a strict parent-child domain hierarchy.

At the point of asset creation, the UI should always state the scope of what is being created:

1. added to this domain's setup
2. added to the global asset library
3. created as a local fork or override

Users should not have to infer asset scope from the page they happen to be on.

### Global Status Center Scope

The persistent status center needs an explicit scope contract.

It should answer:

1. whether it is scoped to:
   - current user
   - current team
   - current session
   - all active infrastructure work
2. how it distinguishes:
   - my launches
   - my recent runs
   - shared system activity
3. when users should leave it and go to:
   - a domain evaluation summary
   - an individual run detail

Without this contract, the global status center will compete with domain monitoring instead of supporting it.

## Workflow Model

The future IA should support this staged workflow, but these stages should be treated as activity lanes rather than a single linear domain state. One domain may contain vignettes in different stages of readiness at the same time.

### Stage 1: Frame The Domain

The user creates a domain and assembles the core test setup.

Primary surface:

1. `Domains > Setup`
2. `Domains > Vignettes`

Key outputs:

1. coherent domain definition
2. usable preamble, context, and value statements
3. initial vignette set
4. a clear path from missing setup assets to vignette creation

### Stage 2: Validate The Instrument

The user runs a small pilot to see whether the vignettes behave as intended.

Primary surfaces:

1. `Domains > Runs`
2. vignette diagnostics reached from a pilot run
3. `Domains > Vignettes` for direct fixing and retuning

Key questions:

1. are the tradeoffs legible?
2. are any vignettes malformed, noisy, or too dominant?
3. does wording need adjustment?
4. can I jump directly from the diagnostic evidence to the vignette that needs editing?

### Stage 3: Run Production Evaluations

The user launches production work across the domain once the instrument is ready.

Primary surfaces:

1. `Domains > Runs`
2. domain evaluation summary
3. global jobs monitor

Key outputs:

1. completed domain evaluation made up of many vignette-scoped runs
2. clear execution status
3. traceable run history
4. cost estimate before launch and realized cost after execution
5. one authoritative monitoring surface for the launch cohort

### Stage 4: Interpret Findings

The user reads domain-level analysis to make broader claims about AI behavior once eligible production data and snapshots exist.

Primary surface:

1. `Domains > Findings`

Key questions:

1. which values dominate others?
2. which patterns are robust at the domain level?
3. what claims can reasonably be made?
4. is the current analysis still diagnostic only, or ready to be treated as findings?
5. am I in Diagnostics or Findings right now?

### Stage 5: Replicate And Reassess

The user runs additional production runs to build confidence.

Primary surfaces:

1. `Domains > Runs`
2. `Domains > Findings`

Key questions:

1. do the findings replicate?
2. how stable are the domain-level patterns across runs?
3. are more instrument changes needed or is the domain ready for broader interpretation?

## Current-To-Future Mapping

This migration should explicitly remap existing areas instead of merely renaming them.

1. current `Vignettes`
   - becomes primarily `Domains > Vignettes`

2. current `Domain Contexts`
   - becomes `Domains > Setup > Context Library / Domain Selection`
   - and remains domain-scoped until schema support exists for true global reuse

3. current `Value Statements`
   - becomes `Domains > Setup > Value Statement Library / Domain Selection`
   - and remains domain-scoped until schema support exists for true global reuse

4. current `Preambles`
   - becomes `Domains > Setup > Preamble Library / Domain Selection`
   - and remains globally reachable from `Domains > Asset Library`

5. current `Level Presets`
   - becomes `Domains > Setup > Preset Library / Domain Selection`
   - and remains globally reachable from `Domains > Asset Library`

6. current `Runs / Trials`
   - becomes primarily `Domains > Runs`
   - as a domain-oriented launch and monitoring surface over many vignette-scoped runs
   - with a domain evaluation summary distinct from individual run detail
   - with a prominent global jobs monitor and persistent status center

7. current vignette `Analysis`
   - becomes a shared diagnostic layer reachable from:
     - `Domains > Runs`
     - `Domains > Findings` as labeled evidence links
     - `Domains > Vignettes`

8. current `Domain Analysis` and `Coverage`
   - becomes `Domains > Findings`

9. current `Compare`
   - splits into:
     - domain-scoped `Cross-Run Comparison` inside `Domains > Findings`
     - global `Benchmark` utility for cross-domain comparison

10. current `Assumptions`
   - transitions toward `Validation`
   - as a reference and reporting area rather than a duplicate execution home
   - may need transitional labeling while it still contains live execution surfaces
   - with domain-scoped entry points back into the current domain
   - and domain-specific validation runs remain visible only in `Domains > Runs` as diagnostic run types

11. current `Survey` and `Survey Results`
   - moves to `Archive` only when the work is historical or explicitly legacy

12. current `Experiments`
   - is deprecated as a first-class navigation model
   - remains available only as a legacy compatibility surface during migration
   - should not receive new primary workflows
   - should retire after route compatibility, historical provenance, and any required comparison migration are in place

## Migration Appendix

### Route Compatibility Matrix

Before Phase 1 ships, the team should create a route compatibility matrix for every live route that is affected by this migration.

For each route, record:

1. current route
2. current page meaning
3. future canonical route
4. temporary alias route if needed
5. redirect behavior
   - hard redirect
   - soft redirect
   - compatibility wrapper
6. sunset rule
7. redirect telemetry owner

The important rule is:

1. no phase should change navigation without an explicit compatibility decision for the routes it displaces

### Immutable Launch Provenance

Domain-grouped execution history needs immutable provenance.

The migration should not rely only on a vignette's current `domainId` when reconstructing historical launch history.

The target model should preserve at least one immutable source of truth at launch time:

1. launch cohort record
2. domain-at-launch snapshot on each run
3. equivalent immutable provenance that survives later vignette reassignment

Without this, historical runs can be silently reparented after domain reassignment and the new `Domains > Runs` history will not be trustworthy.

### Legacy Run Categorization

Run-type rollout must account for historical and mixed-state data.

The migration should define:

1. `Unknown / Legacy` user-facing state for runs that predate categorization
2. non-destructive backfill rules
3. exclusion behavior for uncategorized historical runs in:
   - findings
   - diagnostics
   - monitoring
4. how filters behave when category is missing

The important rule is:

1. a legacy run should never be silently mislabeled as pilot, production, replication, or diagnostic just to satisfy the new UI

### Canonical Entry Points

For each major user task, the plan should define one canonical entry point and any allowed secondary shortcuts.

At minimum:

1. create vignette
   - canonical: `Vignettes`
   - secondary: `Overview` checklist link
2. run pilot or production evaluation
   - canonical: `Runs`
3. inspect run-scoped diagnostics
   - canonical: `Runs`
   - secondary: `Vignettes` history link, `Findings` evidence link
4. edit after diagnostics
   - canonical: vignette editor deep link from diagnostics
5. read auditable findings
   - canonical: `Findings`
6. run or review validation checks
   - canonical execution: `Runs`
   - canonical cross-domain reporting: `Validation`

The important rule is:

1. any non-canonical path must make its scope explicit so teams do not develop conflicting directions for the same task

## Phasing

The change should be phased so the team can improve orientation early without forcing a big-bang rewrite.

### Phase 0: Alignment And Language

Goal:

1. lock the target mental model before changing navigation

Deliverables:

1. this plan
2. updated glossary / terminology decisions for:
   - domain
   - vignette
   - run
   - trial
   - pilot run
   - production run
   - replication run
   - batch
   - findings
   - validation
   - archive
3. analytics and instrumentation plan for current nav usage and page entry paths
4. backend readiness matrix covering:
   - route compatibility and redirect strategy
   - run filtering by domain
   - run categorization
   - immutable launch provenance
   - snapshot completeness
   - global asset support by asset type
   - per-run and per-domain-evaluation status data
   - cost estimate confidence
   - survey classification
   - experiment coexistence
   - domain-level cost preview support
5. asset ownership decision:
   - global library
   - domain attachment
   - domain-local override
6. drafts / unassigned work decision distinct from reusable library assets
7. snapshotting decision for setup state at launch
8. explicit rule for where domain-specific validation runs live and how they are excluded from empirical findings by default
9. decision on whether any active survey workflows remain first-class product surfaces
10. experiment deprecation and compatibility plan
11. run-launch decision covering:
   - run-type selection UX
   - cost estimation
   - persistent status center behavior
   - domain evaluation summary behavior
12. vignette lifecycle decision covering:
   - draft
   - unready
   - ready
   - archived
13. canonical edit / attach / fork contract for setup assets
14. temporary labeling rules for legacy and new analysis surfaces
15. terminology enforcement decisions covering:
   - which labels appear in the primary UI
   - which terms only live in the glossary
   - which terms need inline help or tooltips

Do not do yet:

1. major route churn
2. large component moves
3. promise true domain-run objects before the backend has them
4. promise global contexts or value statements before the schema supports them
5. reparent historical runs by current domain membership alone

### Phase 1: Introduce The New Top-Level Model

Goal:

1. improve global orientation without promising a domain workspace that does not exist yet

Changes:

1. add `Home`
2. add `Domains > Asset Library` only for asset types already global in the backend
3. add `Domains > Drafts / Unassigned` only for workflows the backend can represent cleanly
4. keep `Assumptions` labeled in a transitional way until that area is no longer an execution surface
   - for example: `Assumptions / Validation`
5. move only clearly historical survey surfaces into `Archive`
6. de-emphasize `Settings`
7. add a prominent global jobs monitor utility
8. add a persistent status center entry point
9. add a prominent compare / benchmark entry point
10. implement the route compatibility matrix for any top-level route changes landing in this phase

Expected outcome:

1. users gain better global orientation and operational visibility without a false promise that the inner domain workspace is already rebuilt

### Phase 2: Build The Domain Workspace Shell

Goal:

1. make each domain feel like a coherent project workspace

Changes:

1. create the domain workspace shell
2. add the `Overview`, `Vignettes`, `Setup`, `Runs`, and `Findings` sections
3. move vignette work under `Vignettes`, not under `Setup`
4. move setup asset access under `Setup` without destroying global-library reuse
5. add readiness and recent-activity summaries to `Overview`
6. make readiness explicit at the vignette or vignette-cohort level rather than only the domain level
7. add domain-scoped validation shortcuts from `Overview`
8. keep `Domains > Asset Library` and `Domains > Drafts / Unassigned` available for global asset workflows
9. treat `Findings` as the interpretation destination while keeping diagnostics clearly scoped elsewhere
10. make it explicit in UI copy that `Domains > Runs` is a grouped view over many vignette-scoped runs, not a new persisted domain-run entity
11. add guided vignette creation so users can create missing setup assets inline or jump directly to the missing Setup step
12. add `Edit this vignette` links from diagnostic surfaces even before richer shared diagnostics ship
13. define and expose vignette lifecycle states:
   - draft
   - unready
   - ready
   - archived
14. define Overview recommendation cards as deep links to specific objects or flows rather than generic tab jumps
15. define the canonical diagnostics entry point as `Runs`, with labeled contextual shortcuts from `Vignettes` and `Findings`
16. add an archive concept for vignettes so stale exploratory work does not keep polluting readiness calculations
17. add `Re-run this vignette` shortcuts that deep-link into the launcher with the vignette pre-selected
18. define minimum return-state surfaces for `Home` and `Overview`

Expected outcome:

1. domains become the primary place users start and continue work

### Phase 3: Introduce Run Types And Shared Diagnostics

Goal:

1. make pilot, production, and replication execution legible without creating data silos

Backend prerequisites:

1. define how run categories are stored and backfilled
2. define how domain evaluations are represented in queries and monitoring
3. define the domain query path for grouped runs without N+1 behavior
4. add or define domain-level cost preview support before showing launch-wide cost estimates
5. define launch-summary status aggregation separate from individual run detail and global status center
6. define immutable launch provenance so historical grouped run views do not depend on current vignette-domain assignment

Changes:

1. make `pilot`, `production`, `replication`, and `diagnostic` explicit backend-backed run or launch categories
2. add a user-facing `Unknown / Legacy` state for historical uncategorized runs
3. keep all execution history in `Domains > Runs`
4. add a launch flow that explains when each run type should be used
5. show a setup summary / configuration coverage review in the launch flow before the final confirmation step
6. add run-start confirmation that links into the domain evaluation summary, individual run detail where relevant, and persistent status center
7. add pre-launch cost estimation and post-launch realized-cost reporting
8. add shared vignette diagnostics that can be reached from:
   - pilot runs
   - production runs
   - findings evidence links
   - vignette pages
9. add editing / tuning actions directly from diagnostics
10. stop implying that diagnostics live in a different data world than runs
11. add a distinct `diagnostic / validation run` type for domain-scoped validation checks
12. define the global status center scope contract for multi-user and multi-run situations
13. define non-destructive backfill and exclusion rules for legacy uncategorized runs

Expected outcome:

1. users can clearly distinguish:
   - "is the instrument behaving well?"
   - "what do the domain findings mean?"
2. users never have to wonder whether a pilot run is missing from run history
3. users understand what they are launching, what it is expected to cost, and where to watch progress

### Phase 4: Snapshot Setup And Reframe Production Execution

Goal:

1. make full-domain runs and repeated runs legible and auditable as a domain-level workflow

Backend prerequisites:

1. extend snapshots to cover all mutable prompt inputs required for reproducibility
2. store evaluator and provider configuration inside the effective snapshot boundary
3. define comparison rules for compatible versus incompatible snapshots

Changes:

1. snapshot the setup state at launch for each run
2. rename or reframe trial/run surfaces around explicit run types
3. group execution history by domain
4. distinguish:
   - pilot run
   - production run
   - replication run
   - diagnostic / validation run
5. expose cross-run state inside the domain workspace
6. show when analysis spans incompatible setup snapshots
7. include evaluator and provider configuration in the snapshot boundary
8. enable auditable domain findings inside `Domains > Findings` only once snapshotting is active

Expected outcome:

1. execution history feels tied to research programs, not floating runs
2. domain findings become auditable when setup changes over time

### Phase 5: Deepen Findings For Multi-Run Interpretation

Goal:

1. support broader claims across repeated runs

Changes:

1. add cross-run findings views
2. support stable links from findings to contributing runs
3. preserve drilldowns back to vignette-level diagnostics when a finding needs instrument review
4. add domain-scoped cross-run comparison inside `Domains > Findings`
5. add cross-domain benchmark entry points where benchmark questions span multiple domains
6. define which runs are part of the canonical findings set versus historical reference only

Expected outcome:

1. analysis becomes the place for interpretation, while findings states are clearly distinguished from diagnostic-only states

### Phase 6: Archive And Legacy Migration

Goal:

1. preserve valuable historical research without letting it distort the primary product flow

Backend prerequisites:

1. replace naming-convention survey classification with an explicit data attribute, or keep legacy survey routing in place until that exists

Changes:

1. move only historical or explicitly legacy surveys and survey results under `Archive`
2. retire or redirect obsolete navigation paths
3. clearly label legacy or archived work

Expected outcome:

1. users can still access older research surfaces, but they no longer compete with the main domain workflow

## Success Criteria

### UX Success

1. a new internal user can describe the site as domain-first rather than artifact-first
2. a user can tell where to go for:
   - building the instrument
   - validating the instrument
   - running production work
   - interpreting findings
3. users no longer confuse vignette-level diagnostics with domain-level claims
4. users can tell whether they are looking at diagnostic analysis or auditable findings
5. users can locate and reopen active run status from anywhere in the product
6. users can create a vignette without getting stuck between `Vignettes` and `Setup`
7. users can tell whether a vignette is inheriting a domain default or using an override
8. users can tell whether unfinished work is:
   - unassigned draft work
   - unready domain work
   - archived work

### Product Success

1. more work begins from `Domains` than from standalone asset pages
2. fewer navigation jumps are required to move from setup to pilot to findings
3. users can more easily distinguish archived research from current domain research
4. users can estimate cost before launch and understand realized cost after execution
5. analytics instrumentation plan to be defined separately

### Implementation Success

1. the migration can be shipped incrementally
2. existing deep links can be redirected safely
3. existing pages can be rehomed before they are fully redesigned
4. shared assets remain reusable without silent cross-domain drift
5. launch, status, and analysis surfaces all agree about the same underlying run state
6. `Domains > Runs` does not rely on unbounded joins or N+1 queries to assemble domain-level history
7. domain evaluation summary, individual run detail, and global status center have clearly different authoritative scopes

## Risks

1. route churn may break existing habits and bookmarked pages
2. moving setup access under domains may frustrate power users if global access disappears entirely
3. the term `Batch` may be overloaded incorrectly unless the glossary distinction from `Run` is preserved in UI copy
4. archive labeling may still confuse users if active survey work exists
5. validation surfaces may become too hidden if users rely on them daily during tuning
6. cross-domain comparison may remain awkward if compare tools stay too domain-scoped
7. snapshotting may surface existing data-model gaps that block rollout order
8. attached global assets may cause accidental future-state drift if version pinning is not enforced
9. domain-specific validation runs may confuse findings if their run type is not clearly excluded from empirical summaries
10. `Findings` may still overpromise if diagnostic-only and auditable findings states are not labeled clearly
11. cost estimation may create distrust if estimate inputs and realized-cost boundaries are not explicit
12. the persistent status center may create support burden if backend progress states are stale or incomplete
13. the migration may stall if domain-evaluation UX is treated as equivalent to a real domain-run backend object
14. experiment grouping may conflict with the new domain workspace unless coexistence or deprecation is chosen explicitly
15. users may misconfigure launches if domain defaults and per-vignette overrides are not distinguished clearly
16. unfinished and archived vignette states may become noisy if their lifecycle rules are not explicit
17. historical runs may be misgrouped if immutable launch provenance is not added before domain-grouped history becomes canonical
18. legacy runs may be mislabeled or silently excluded if the unknown-state migration path is not explicit

## Guardrails

1. preserve direct links to existing pages during migration
2. keep global search, compare, and global jobs available even in a domain-first model
3. avoid blocking Phase 1 on full page rewrites
4. do not treat archived work as deleted work
5. maintain drilldowns from analysis to runs and from runs to vignette diagnostics
6. keep global-library asset workflows viable throughout migration
7. require pinned asset versions for future runs
8. keep domain-specific validation runs in run history while excluding them from empirical findings by default
9. do not expose `Findings` as an auditable state until snapshotting is active
10. keep cost estimate, live status, and finalized cost visible from launch through completion
11. label any estimate or ETA with confidence when it depends on fallback or heuristic data
12. do not promise global asset reuse for contexts or value statements until schema support exists
13. do not route active survey workflows into `Archive` on the basis of naming conventions alone
14. do not make users infer missing setup dependencies during vignette creation
15. do not use the global status center as the primary monitor for one domain evaluation cohort
16. do not let archived exploratory work keep driving current readiness recommendations
17. do not replace or redirect routes without a compatibility-matrix decision and redirect telemetry
18. do not treat current vignette-domain assignment as the only source of truth for historical grouped run history
19. do not silently coerce legacy runs into new categories without a visible `Unknown / Legacy` state

## Open Questions

1. should global `Jobs` be a utility drawer or a full page?
2. what is the exact contract between the persistent status center, global jobs monitor, and run detail page?
3. what backend inputs are trustworthy enough for pre-launch cost estimation?
4. should global `Benchmark` and domain-scoped `Cross-Run Comparison` share one surface or remain distinct?
5. how should the product expose run types while preserving the glossary distinction between `run` and `batch`?
6. how much global access should remain for setup assets once domain-scoped selection exists?
7. what is the correct snapshot boundary for setup state at launch?
8. what user interaction should adopt newer shared-asset versions inside a domain?
9. should the backend gain a true domain-evaluation entity, or should the UI remain an orchestration layer over grouped vignette runs?
10. what is the retirement timeline for legacy `Experiment` compatibility surfaces after migration?
11. where should users review effective per-vignette configuration and overrides before launch?
12. what is the authoritative scope of the global status center in multi-user environments?
13. how should top-level `Validation` indicate whether domain-scoped diagnostic runs have flowed into shared reporting yet?
14. what is the minimum immutable provenance record required to make `Domains > Runs` historically trustworthy during rollout?
15. how long should legacy route aliases and compatibility wrappers remain in place?

## Suggested Review Lenses

This plan should be pressure-tested through at least these lenses:

1. architecture
2. UX / information architecture
3. migration / regression risk
4. operational realism
5. terminology / product semantics
