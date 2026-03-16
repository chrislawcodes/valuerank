# Route Compatibility Matrix

Generated: 2026-03-15

This matrix is the Phase 0 routing contract for the domain-first IA migration.

## Rules

1. Do not remove or repurpose a live route without an explicit compatibility decision.
2. Old links must preserve historical meaning even when top-level navigation changes.
3. A future route may become canonical before the old route is sunset, but the old route must still land users in a coherent surface with transitional labeling.
4. Redirects are not sufficient when the destination changes semantics. Use transitional labels or compatibility wrappers in those cases.

## Top-Level Routes

| Current Route | Current Meaning | Transitional Behavior | Future Canonical Surface | Sunset Rule |
| --- | --- | --- | --- | --- |
| `/` | Dashboard | Keep route; reframe as `Home` | `/` | Never sunset |
| `/domains` | Domain list and management | Keep route; becomes `Domains` entry | `/domains` | Never sunset |
| `/definitions` | Vignette list | Keep route during migration; surface as Vignettes compatibility view until `Domains > Vignettes` is primary | `Domains > Vignettes` | Sunset only after domain workspace deep links exist |
| `/runs` | Global runs list | Keep route as compatibility/global runs surface while `Domains > Runs` becomes primary for domain work | `Domains > Runs` for domain-scoped launch and monitoring | Keep as global operational view unless replaced explicitly |
| `/analysis` | Global vignette analysis | Keep with explicit legacy/global analysis labeling until `Findings` and scoped diagnostics are established | `Domains > Findings` and scoped diagnostics | Sunset after scoped replacements and redirect messaging exist |
| `/compare` | Global compare | Keep as global benchmark utility | `/compare` | Never sunset unless replaced by new benchmark route |
| `/settings` | Admin/settings | Keep route | `/settings` | Never sunset |

## Validation And Archive

| Current Route | Current Meaning | Transitional Behavior | Future Canonical Surface | Sunset Rule |
| --- | --- | --- | --- | --- |
| `/assumptions` | Legacy assumptions landing | Keep redirect behavior, but nav label moves toward `Validation` | `/validation` top-level nav label with compatibility aliases | Sunset only after all assumptions surfaces have compatibility labels |
| `/assumptions/temp-zero-effect` | Temp=0 check surface | Keep route; add `Validation` transitional framing | `Validation` reporting plus `Domains > Runs` for execution | Keep until scoped replacements exist |
| `/assumptions/analysis` | Assumptions analysis | Keep route with transitional labeling | `Validation` | Sunset after route aliases and reporting parity exist |
| `/assumptions/analysis-v1` | Legacy assumptions analysis | Keep route with explicit `Old V1` labeling | `Validation` or archived compatibility surface | Sunset last |
| `/survey` | Survey work | Redirect to the canonical archive-prefixed survey route while preserving search params; keep legacy framing in the destination | `/archive/surveys` | Sunset only after legacy survey users no longer depend on the alias |
| `/survey-results` | Survey results | Redirect to the canonical archive-prefixed results route while preserving search params; keep legacy framing in the destination | `/archive/survey-results` | Sunset only after results remain findable from Archive |
| `/experiments` | Legacy alias to survey | Keep redirect to `/archive` while Experiment deprecation completes | `/archive` or retired alias | Sunset after explicit Experiment compatibility period |

## Domain-Related Routes

| Current Route | Current Meaning | Transitional Behavior | Future Canonical Surface | Sunset Rule |
| --- | --- | --- | --- | --- |
| `/domains/analysis` | Domain-level analysis | Keep route; likely becomes compatibility entry into `Domains > Findings` | `Domains > Findings` | Sunset after findings surface is primary |
| `/domains/coverage` | Domain coverage | Keep route; likely becomes findings sub-surface | `Domains > Findings` | Sunset after sub-routing exists |
| `/domains/analysis/value-detail` | Domain value detail | Keep route as compatibility deep link | `Domains > Findings` detail | Sunset after replacement deep links exist |
| `/domains/:domainId/run-trials` | Domain trials dashboard | Keep route; candidate precursor to `Domain Evaluation Summary` | `Domains > Runs` / evaluation summary | Sunset after cohort summary exists |
| `/domain-contexts` | Global/standalone context management | Keep route during migration; treat as Setup compatibility surface | `Domains > Setup` | Sunset after per-domain setup routing is available |
| `/value-statements` | Global/standalone value statement management | Keep route during migration; treat as Setup compatibility surface | `Domains > Setup` | Sunset after per-domain setup routing is available |
| `/preambles` | Standalone preamble management | Keep route; can survive as asset-library view even after setup refactor | `Domains > Setup` and asset library | Do not sunset until asset-library model is settled |
| `/level-presets` | Standalone preset management | Keep route; can survive as asset-library view even after setup refactor | `Domains > Setup` and asset library | Do not sunset until asset-library model is settled |
| `/job-choice/new` | New-pair creation flow | Keep route during migration as vignette-creation compatibility entry | `Domains > Vignettes` creation flow | Sunset after guided vignette creation exists |

## Deep-Link Rules

1. Old deep links to `RunDetail`, `AnalysisDetail`, `AnalysisTranscripts`, and `DefinitionDetail` remain valid until their replacement surfaces have object-level compatibility routes.
2. A deep link must never start landing on a broader list page that forces the user to re-find the object manually.
3. If a compatibility route lands on a reframed surface, that surface must show a short transitional label explaining the old/new relationship.

## Telemetry Requirement

For every route that eventually sunsets, capture:

1. alias traffic volume
2. top referrers
3. deep-link usage frequency
4. failure or 404 counts

No route should sunset solely because a replacement exists on paper.
