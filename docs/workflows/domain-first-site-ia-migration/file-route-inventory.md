# File And Route Inventory

Generated: 2026-03-15

This inventory anchors the migration to the current codebase so implementation waves do not have to rediscover the surface area.

## Core App And Navigation

| Surface | File |
| --- | --- |
| App routes | [cloud/apps/web/src/App.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/App.tsx) |
| Desktop nav | [cloud/apps/web/src/components/layout/NavTabs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/NavTabs.tsx) |
| Mobile nav | [cloud/apps/web/src/components/layout/MobileNav.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/MobileNav.tsx) |
| Layout shell | [cloud/apps/web/src/components/layout/Layout.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/Layout.tsx) |

## Current Page Inventory

| Route | Page File | Current Role |
| --- | --- | --- |
| `/` | [cloud/apps/web/src/pages/Dashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Dashboard.tsx) | dashboard / future home |
| `/definitions` | [cloud/apps/web/src/pages/Definitions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Definitions.tsx) | vignette list |
| `/definitions/:id` | [cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx) | vignette detail |
| `/domains` | [cloud/apps/web/src/pages/Domains.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Domains.tsx) | domain list / management |
| `/domains/:domainId/run-trials` | [cloud/apps/web/src/pages/DomainTrialsDashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainTrialsDashboard.tsx) | domain trial dashboard |
| `/domains/analysis` | [cloud/apps/web/src/pages/DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx) | domain analysis |
| `/domains/coverage` | [cloud/apps/web/src/pages/DomainCoverage.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainCoverage.tsx) | domain coverage |
| `/domains/analysis/value-detail` | [cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx) | value detail |
| `/runs` | [cloud/apps/web/src/pages/Runs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Runs.tsx) | global runs |
| `/runs/:id` | [cloud/apps/web/src/pages/RunDetail/RunDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx) | run detail |
| `/analysis` | [cloud/apps/web/src/pages/Analysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Analysis.tsx) | global analysis |
| `/analysis/:id` | [cloud/apps/web/src/pages/AnalysisDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisDetail.tsx) | analysis detail |
| `/analysis/:id/transcripts` | [cloud/apps/web/src/pages/AnalysisTranscripts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisTranscripts.tsx) | analysis transcripts |
| `/compare` | [cloud/apps/web/src/pages/Compare.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Compare.tsx) | compare / benchmark |
| `/archive/surveys` | [cloud/apps/web/src/pages/Survey.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Survey.tsx) | canonical legacy survey work route |
| `/archive/survey-results` | [cloud/apps/web/src/pages/SurveyResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/SurveyResults.tsx) | canonical legacy survey results route |
| `/survey` | [cloud/apps/web/src/pages/Survey.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Survey.tsx) | compatibility alias to archive survey work |
| `/survey-results` | [cloud/apps/web/src/pages/SurveyResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/SurveyResults.tsx) | compatibility alias to archive survey results |
| `/assumptions/temp-zero-effect` | [cloud/apps/web/src/pages/TempZeroEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/TempZeroEffectAssumptions.tsx) | temp zero validation |
| `/assumptions/analysis` | [cloud/apps/web/src/pages/AnalysisAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisAssumptions.tsx) | assumptions analysis |
| `/assumptions/analysis-v1` | [cloud/apps/web/src/pages/OrderEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/OrderEffectAssumptions.tsx) | old assumptions analysis |
| `/preambles` | [cloud/apps/web/src/pages/Preambles.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Preambles.tsx) | setup asset |
| `/level-presets` | [cloud/apps/web/src/pages/LevelPresets.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/LevelPresets.tsx) | setup asset |
| `/domain-contexts` | [cloud/apps/web/src/pages/DomainContexts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainContexts.tsx) | setup asset |
| `/value-statements` | [cloud/apps/web/src/pages/ValueStatements.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/ValueStatements.tsx) | setup asset |
| `/settings` | [cloud/apps/web/src/pages/Settings.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Settings.tsx) | settings |
| `/job-choice/new` | [cloud/apps/web/src/pages/JobChoiceNew.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/JobChoiceNew.tsx) | new vignette pair creation |

## Key Backend Anchors

| Concern | File |
| --- | --- |
| current schema | [cloud/packages/db/prisma/schema.prisma](/Users/chrislaw/valuerank/cloud/packages/db/prisma/schema.prisma) |
| run launch mutation | [cloud/apps/api/src/graphql/mutations/run.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/run.ts) |
| web run operations | [cloud/apps/web/src/api/operations/runs.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/runs.ts) |
| web definition operations | [cloud/apps/web/src/api/operations/definitions.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/definitions.ts) |

## Important Schema Facts

1. `Definition.domainId` is nullable and mutable.
2. `Run.definitionId` is non-null and indexed.
3. `Run.experimentId` exists, which is why Experiment deprecation must be explicit rather than implied.
4. There is no first-class `domainId` on `Run` today.
5. Domain contexts and value statements are domain-owned in the current schema.
