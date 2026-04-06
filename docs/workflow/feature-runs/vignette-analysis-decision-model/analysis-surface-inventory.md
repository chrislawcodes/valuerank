# Analysis Surface Inventory

Context: this inventory was written after the `vignette-analysis-decision-model` feature landed and PR [#399](https://github.com/chrislawcodes/valuerank/pull/399) merged.

Legend:
- `Upgraded` means the surface is already on the new report/audit transcript flow or is intentionally wired to the V2-compatible decision presentation.
- `Need work` means the surface still relies on legacy score-based analysis, or it was not migrated by this feature and should be revisited later.

## Groups

These groups describe the kind of work needed to finish or clean up a surface.

- `Presentation only` means the surface is mostly UI, copy, route, or modal behavior.
- `Container / wiring` means the surface needs prop, route, or query wiring, but not new math.
- `Data contract` means the surface needs a different shaped analysis payload or shared adapter boundary.
- `Analytics math` means the surface needs deeper aggregation, stats, or scoring changes.
- `Cleanup` means the surface is legacy or inactive and should be removed once the new path is stable.
- `Other transcript consumers` means transcript surfaces outside the report/audit path.

## Presentation-Only Backend Impacts

These are the concrete changes the presentation-only surfaces still need because of the new backend contract.

| Surface | Production URL | What the backend must provide | What the table should change |
|---|---|---|---|
| Transcript audit list | [valuerank.org/analysis](https://valuerank.org/analysis) | Canonical decision data, raw evidence, parse class, source, and orientation-normalized decision metadata | Show a simple decision summary badge. Keep the transcript list and viewer in the same mode. |
| Condition transcript detail | [valuerank.org/analysis](https://valuerank.org/analysis) | Per-condition decision counts, condition labels, and transcript-level provenance | Show the count summary above the list and make the breadcrumb/title easier to read. |
| Report detail transcript table | [valuerank.org/domains/analysis](https://valuerank.org/domains/analysis) | Cell-level transcript counts and stable condition identity for each pivot cell | Show the count in each cell, keep the matrix easy to scan, and open the matching evidence without changing the report mode. |
| Shared transcript list | [valuerank.org/runs](https://valuerank.org/runs) | One decision display contract that can render either canonical or legacy mode consistently | Use one row style and pass an explicit mode so rows do not mix meanings. |
| Shared transcript row | [valuerank.org/runs](https://valuerank.org/runs) | Decision headline, raw evidence markers, and a stable override/fallback indicator | Show why a row matters before the modal opens. |
| Shared transcript viewer | [valuerank.org/runs](https://valuerank.org/runs) | Full canonical decision envelope plus legacy compatibility only when the parent surface asks for it | Put the decision summary first, then the raw evidence, then the transcript text. Keep mode labels out of the main reading flow. |

## Upgraded

| Surface | Group | File | URL(s) | Status | Notes |
|---|---|---|---|---|---|
| Transcript audit list | Presentation only | [cloud/apps/web/src/pages/AnalysisTranscripts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisTranscripts.tsx) | `/analysis/:id/transcripts` | Upgraded | Switches between legacy and audit modes, shows canonical decision data when V2 is present, and keeps the modal in the same surface mode. |
| Condition transcript detail | Presentation only | [cloud/apps/web/src/pages/AnalysisConditionDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisConditionDetail.tsx) | `/analysis/:id/conditions/:conditionKey` | Upgraded | Uses the report-level transcript flow and opens the matching transcripts from the condition table. |
| Report detail transcript table | Presentation only | [cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx) | `/domains/analysis/value-detail?domainId=:domainId&modelId=:modelId&valueKey=:valueKey&scoreMethod=:scoreMethod&signature=:signature` | Upgraded | The condition report surface now stays on one decision mode per table/modal surface. |
| Shared transcript list | Presentation only | [cloud/apps/web/src/components/runs/TranscriptList.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/TranscriptList.tsx) | `/analysis/:id/transcripts`, `/analysis/:id/conditions/:conditionKey`, `/runs/:id`, `/archive/survey-results` | Upgraded | Accepts the decision display mode from the parent surface and renders canonical or legacy rows consistently. |
| Shared transcript row | Presentation only | [cloud/apps/web/src/components/runs/TranscriptRow.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/TranscriptRow.tsx) | `/analysis/:id/transcripts`, `/analysis/:id/conditions/:conditionKey`, `/runs/:id`, `/archive/survey-results` | Upgraded | Renders canonical V2 decision data when the parent surface is in audit mode. |
| Shared transcript viewer | Presentation only | [cloud/apps/web/src/components/runs/TranscriptViewer.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/TranscriptViewer.tsx) | `/analysis/:id/transcripts`, `/analysis/:id/conditions/:conditionKey`, `/runs/:id`, `/archive/survey-results` | Upgraded | Supports canonical audit mode and legacy mode without mixing them in the same surface. |
| Condition decisions table | Data contract | [cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx) | `/analysis/:id?tab=scenarios` | Upgraded | The condition table now drills into the transcript list using the report/audit flow. It still uses score-shaped compatibility data, so this is upgraded for now but still part of the later score cleanup. |
| Decision distribution chart | Data contract | [cloud/apps/web/src/components/analysis/DecisionDistributionChart.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/DecisionDistributionChart.tsx) | `/analysis/:id?tab=decisions` | Upgraded | This chart already speaks in normalized 1-5 decision codes, so it matches the new decision vocabulary even though it still uses compatibility-shaped analysis data. |

## Legacy Summary Dependencies

These surfaces still depend on the old summary or score-shaped analysis data today. They should stay on the cleanup list until the backend can feed them the new canonical or AME-style data they need.

| Surface | Why it still needs old summary | What should change later |
|---|---|---|
| Condition decisions table | Still uses compatibility-shaped score data for its table logic, even though the drill-in flow is upgraded. | Rebuild the table around canonical decision data or a clean analysis metric instead of the old score-shaped summary. |
| Decision distribution chart | Still depends on normalized compatibility values to draw the chart. | Switch the chart to the new canonical analysis contract or a better-derived metric once the backend is ready. |
| Domain analysis overview | Still driven by score-based domain analysis and win-rate style summaries. | Replace the old summary numbers with canonical decision analysis or AME-style sensitivity numbers where appropriate. |
| Analysis panel container | Hosts several legacy summary tabs and still passes through the old analysis surfaces. | Remove the old summary-driven tabs once each child surface has a V2 replacement. |
| Overview summary table | Still summarizes preference, reliability, and repeat-pattern statistics rather than canonical decision data. | Rebuild the summary around the new analysis contract instead of the old score-based summary. |
| Scenarios table tab | Still contains pivot logic that averages score-like values. | Replace the pivot logic with the new analysis data and keep the condition drill-in flow only. |
| Decisions tab | Still bundles legacy chart surfaces that are not all on the new decision contract. | Split or rebuild the tab so each chart gets its own V2-ready data source. |
| Agreement tab | Still wraps the model agreement matrix, which is score-style analysis. | Remove or rebuild it after the agreement data is moved off the old summary path. |
| Score distribution chart | Still shows win rates and confidence intervals from legacy score semantics. | Rework it around canonical analysis or remove it once the new surfaces replace it. |
| Variable impact chart | Still reports effect sizes and variance explanation from old analysis logic. | Rebuild it as a real attribute-sensitivity surface, likely with AME. |
| Model comparison matrix | Still renders pairwise model agreement scores. | Replace the matrix with a canonical comparison view or remove the old score matrix. |
| Model consistency chart | Still reports reliability and repeatability from score-style analysis. | Rebuild it around canonical decision consistency. |
| Contested scenarios list | Still presents score-like model summaries for contested scenarios. | Replace those summaries with canonical decision summaries or a better contest metric. |
| Scenario variance chart | Still visualizes variance, mean, and range of score values. | Rework it around the new analysis contract or remove the score-based summary. |
| Pivot analysis table | Still averages score values across condition pivots. | Replace score averaging with canonical decision analysis or AME where that makes sense. |
| Run results | Still opens transcript surfaces in the legacy/default mode. | Pass the V2 display mode through the run results surface once the backend is ready. |
| Survey results | Still opens the transcript viewer directly without the report/audit split. | Add the same decision-mode handoff used by the upgraded transcript audit flow. |

## Need Work

| Surface | Group | File | URL(s) | Status | Notes |
|---|---|---|---|---|---|
| Domain analysis overview | Analytics math | [cloud/apps/web/src/pages/DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx) | `/domains/analysis` | Need work | This is the main page that will eventually move off score-based domain analysis and onto the new canonical or AME-style summaries. |
| Analysis panel container | Container / wiring | [cloud/apps/web/src/components/analysis/AnalysisPanel.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/AnalysisPanel.tsx) | `/analysis/:id` | Need work | This container still routes users through legacy summary tabs that have not been fully migrated. |
| Overview summary table | Analytics math | [cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx) | `/analysis/:id?tab=overview` | Need work | This table still summarizes old preference and reliability numbers instead of the new canonical decision analysis. |
| Scenarios table tab | Container / wiring | [cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx) | `/analysis/:id?tab=scenarios` | Need work | The tab still contains the old pivot analysis path that needs a new summary contract. |
| Decisions tab | Container / wiring | [cloud/apps/web/src/components/analysis/tabs/DecisionsTab.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/tabs/DecisionsTab.tsx) | `/analysis/:id?tab=decisions` | Need work | This tab still bundles chart pieces that are not all ready for the new summary data. |
| Agreement tab | Cleanup | [cloud/apps/web/src/components/analysis/tabs/AgreementTab.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/tabs/AgreementTab.tsx) | No active URL in the current tab set | Need work | This is still a legacy score-style surface that should be removed or rebuilt later. |
| Score distribution chart | Analytics math | [cloud/apps/web/src/components/analysis/ScoreDistributionChart.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ScoreDistributionChart.tsx) | `/analysis/:id?tab=decisions` | Need work | This chart still depends on the old score-based summary numbers. |
| Variable impact chart | Analytics math | [cloud/apps/web/src/components/analysis/VariableImpactChart.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/VariableImpactChart.tsx) | `/analysis/:id?tab=overview` | Need work | This chart is a good candidate for AME, but it still needs a new backend summary path first. |
| Model comparison matrix | Analytics math | [cloud/apps/web/src/components/analysis/ModelComparisonMatrix.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ModelComparisonMatrix.tsx) | `/analysis/:id?tab=agreement` historically; no active URL now | Need work | This matrix still depends on old pairwise agreement scoring. |
| Model consistency chart | Analytics math | [cloud/apps/web/src/components/analysis/ModelConsistencyChart.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ModelConsistencyChart.tsx) | `/analysis/:id?tab=decisions` | Need work | This chart still uses old reliability and repeatability numbers. |
| Contested scenarios list | Analytics math | [cloud/apps/web/src/components/analysis/ContestedScenariosList.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ContestedScenariosList.tsx) | `/analysis/:id?tab=overview` | Need work | This list still depends on score-like summaries for contested cases. |
| Scenario variance chart | Analytics math | [cloud/apps/web/src/components/analysis/ScenarioVarianceChart.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/ScenarioVarianceChart.tsx) | `/analysis/:id?tab=scenarios` | Need work | This chart still visualizes score variance from the old summary path. |
| Pivot analysis table | Analytics math | [cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx) | `/analysis/:id?tab=scenarios` | Need work | This table still averages old score values across pivots. |

## Other Transcript Consumers Outside Report/Audit

| Surface | Group | File | URL(s) | Status | Notes |
|---|---|---|---|---|---|
| Run results | Other transcript consumers | [cloud/apps/web/src/components/runs/RunResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/RunResults.tsx) | `/runs/:id` | Need work | Still opens `TranscriptList` and `TranscriptViewer` in the legacy/default mode. |
| Survey results | Other transcript consumers | [cloud/apps/web/src/pages/SurveyResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/SurveyResults.tsx) | `/archive/survey-results` | Need work | Still opens `TranscriptViewer` directly without the report/audit decision-mode split. |

## AME Fit

Average Marginal Effect should be used only on surfaces that are meant to show how attribute `Level` changes affect model behavior.

| Fit | Surface | Why |
|---|---|---|
| Good fit | Domain analysis overview | This is the most natural place for a sensitivity summary across attributes. |
| Good fit | Variable impact chart | This chart already tries to explain which attributes drive change, so AME is a direct match. |
| Possible later | Pivot analysis table | This could use AME if we rework it into an attribute-sensitivity table instead of a score-average table. |
| Not a fit | Transcript audit list, condition detail, report detail transcript table, shared transcript list/row/viewer | These are evidence and audit surfaces, not attribute-sensitivity summaries. |
| Not a fit | Overview summary table, decisions tab, score distribution chart, model comparison matrix, model consistency chart, contested scenarios list, scenario variance chart | These surfaces describe model summaries, agreement, or variance, but not attribute-level level-pressure sensitivity. |
| Not a fit | Analysis panel container, agreement tab, run results, survey results | These are containers or legacy transcript entry points, not AME surfaces. |

## Short Takeaway

The report/audit transcript surfaces are upgraded.

The rest of the analysis chart/table stack is still mostly legacy score-based analysis, especially the overview, agreement, reliability, variance, pivot, and score-distribution surfaces.

The two transcript consumers outside the report/audit path that still need attention are `RunResults` and `SurveyResults`.
