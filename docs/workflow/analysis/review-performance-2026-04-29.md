# FF Review Performance Analysis

Generated: 2026-04-29T21:07:03.480668Z

## 1. Headline Numbers

- Total reviewer + judge calls measured: 1446
- Total wall-clock seconds: 64380.1
- Total estimated USD cost: $0.02
- Calls with token parse errors: 1437 (99.4%)
- Date range covered: 2026-04-19T13:52:00.107591Z to 2026-04-29T21:05:16.047845Z
- Distinct slugs: 26

## 2. Per (model x activity_type) Summary

| model | activity_type | count | total_duration_s | p50_s | p95_s | p99_s | max_s | parse_error_count | parse_error_rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.4-mini | adversarial_review | 392 | 35782.1 | 85.6 | 180.0 | 180.0 | 190.5 | 383 | 97.7% |
| gemini-2.5-pro | adversarial_review | 204 | 14896.5 | 51.0 | 236.1 | 289.8 | 600.0 | 204 | 100.0% |
| claude-sonnet-4-6 | judge_panel | 286 | 8447.4 | 0.0 | 157.9 | 180.0 | 180.0 | 286 | 100.0% |
| gpt-5.4-mini | judge_panel | 277 | 2934.2 | 0.0 | 63.8 | 108.1 | 159.2 | 277 | 100.0% |
| gpt-5.4 | judge_panel | 287 | 2320.0 | 0.0 | 39.8 | 53.8 | 73.3 | 287 | 100.0% |

## 3. Per (model x stage) Summary

| model | stage | count | total_duration_s | p50_s | p95_s | p99_s | max_s | parse_error_count | parse_error_rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.4-mini | spec | 209 | 19694.4 | 91.7 | 179.9 | 180.0 | 186.2 | 202 | 96.7% |
| gpt-5.4-mini | plan | 332 | 9996.4 | 0.0 | 148.3 | 180.0 | 190.5 | 330 | 99.4% |
| gemini-2.5-pro | spec | 88 | 7660.7 | 53.4 | 246.2 | 398.9 | 600.0 | 88 | 100.0% |
| claude-sonnet-4-6 | spec | 50 | 5123.2 | 92.2 | 177.7 | 180.0 | 180.0 | 50 | 100.0% |
| gpt-5.4-mini | diff | 62 | 4977.9 | 74.0 | 180.0 | 180.0 | 180.0 | 62 | 100.0% |
| gpt-5.4-mini | tasks | 64 | 4008.6 | 50.6 | 144.3 | 173.4 | 180.0 | 64 | 100.0% |
| gemini-2.5-pro | plan | 52 | 3409.1 | 48.6 | 169.6 | 266.3 | 289.8 | 52 | 100.0% |
| gemini-2.5-pro | diff | 34 | 2325.3 | 51.6 | 220.9 | 223.8 | 224.5 | 34 | 100.0% |
| claude-sonnet-4-6 | plan | 226 | 2082.4 | 0.0 | 110.8 | 166.2 | 180.0 | 226 | 100.0% |
| gpt-5.4 | spec | 50 | 1479.9 | 29.2 | 46.6 | 61.0 | 73.3 | 50 | 100.0% |
| gemini-2.5-pro | tasks | 28 | 1354.7 | 42.5 | 94.9 | 97.7 | 97.9 | 28 | 100.0% |
| claude-sonnet-4-6 | tasks | 8 | 1086.0 | 123.7 | 176.1 | 179.2 | 180.0 | 8 | 100.0% |
| gpt-5.4 | plan | 227 | 427.7 | 0.0 | 16.4 | 42.2 | 57.5 | 227 | 100.0% |
| gpt-5.4 | tasks | 8 | 351.0 | 44.3 | 58.2 | 60.3 | 60.8 | 8 | 100.0% |
| claude-sonnet-4-6 | diff | 2 | 155.8 | 77.9 | 126.8 | 131.2 | 132.3 | 2 | 100.0% |
| gemini-2.5-pro | closeout | 2 | 146.7 | 73.4 | 115.3 | 119.1 | 120.0 | 2 | 100.0% |
| gpt-5.4 | diff | 2 | 61.5 | 30.7 | 30.8 | 30.8 | 30.8 | 2 | 100.0% |
| gpt-5.4-mini | closeout | 2 | 39.1 | 19.6 | 23.1 | 23.4 | 23.5 | 2 | 100.0% |

## 3a. Best-Effort Lens Summary

| lens | model | count | total_duration_s | p50_s | max_s | parse_error_count |
| --- | --- | --- | --- | --- | --- | --- |
| requirements-adversarial | gemini-2.5-pro | 86 | 7420.7 | 53.1 | 600.0 | 86 |
| testability-adversarial | gemini-2.5-pro | 52 | 3409.1 | 48.6 | 289.8 | 52 |
| quality-adversarial | gemini-2.5-pro | 34 | 2325.3 | 51.6 | 224.5 | 34 |
| implementation-risk-judge | claude-sonnet-4-6 | 16 | 1709.6 | 91.0 | 180.0 | 16 |
| coverage-adversarial | gemini-2.5-pro | 28 | 1354.7 | 42.5 | 97.9 | 28 |
| completeness-judge | gpt-5.4 | 20 | 456.7 | 22.4 | 37.6 | 20 |
| execution-adversarial | gpt-5.4-mini | 4 | 339.6 | 81.8 | 145.8 | 4 |
| completeness-judge | gpt-5.4-mini | 12 | 269.8 | 12.5 | 57.8 | 12 |
| residual-risk-adversarial | gemini-2.5-pro | 2 | 146.7 | 73.4 | 120.0 | 2 |
| restatement-judge | gpt-5.4 | 6 | 94.7 | 4.9 | 44.7 | 6 |

## 4. Top 20 Slowest Individual Calls

| slug | stage | round | activity_type | model | duration_s | input_tokens | output_tokens | parse_error | timestamp |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 600.0 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:56:18.195923Z |
| sensitivity-table-redesign-v2 | spec | 0 | adversarial_review | gemini-2.5-pro | 368.8 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:35:16.533061Z |
| sensitivity-table-redesign-v2 | plan | 1 | adversarial_review | gemini-2.5-pro | 289.8 |  |  | no Gemini token stats found in stdout | 2026-04-29T17:28:18.451240Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 288.7 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:42:11.969889Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 261.6 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:03:08.523439Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 247.8 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:18:47.229107Z |
| sensitivity-table-redesign-v2 | plan | 1 | adversarial_review | gemini-2.5-pro | 243.8 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:49:30.638288Z |
| sensitivity-table-redesign-v2 | spec | 0 | adversarial_review | gemini-2.5-pro | 243.1 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:20:34.246092Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 242.9 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:07:11.438231Z |
| sensitivity-table-redesign-v2 | spec | 0 | adversarial_review | gemini-2.5-pro | 238.0 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:27:59.424519Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 237.1 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:11:31.236925Z |
| sensitivity-table-redesign-v2 | plan | 1 | adversarial_review | gemini-2.5-pro | 230.2 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:53:20.803270Z |
| sensitivity-table-redesign-v2 | diff | 1 | adversarial_review | gemini-2.5-pro | 224.5 |  |  | no Gemini token stats found in stdout | 2026-04-29T18:01:47.545687Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 224.4 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:14:39.414512Z |
| sensitivity-table-redesign-v2 | spec | 1 | adversarial_review | gemini-2.5-pro | 223.6 |  |  | no Gemini token stats found in stdout | 2026-04-29T16:10:55.006492Z |
| sensitivity-table-redesign-v2 | diff | 1 | adversarial_review | gemini-2.5-pro | 222.5 |  |  | no Gemini token stats found in stdout | 2026-04-29T18:05:30.007085Z |
| sensitivity-table-redesign-v2 | diff | 1 | adversarial_review | gemini-2.5-pro | 220.1 |  |  | no Gemini token stats found in stdout | 2026-04-29T17:52:12.224115Z |
| sensitivity-table-redesign-v2 | spec | 0 | adversarial_review | gemini-2.5-pro | 207.1 |  |  | no Gemini token stats found in stdout | 2026-04-29T15:24:01.372048Z |
| sensitivity-table-redesign-v2 | plan | 0 | adversarial_review | gpt-5.4-mini | 190.5 |  |  | no Codex token block found in stderr | 2026-04-29T17:11:19.081636Z |
| sensitivity-table-redesign-v2 | spec | 0 | adversarial_review | gpt-5.4-mini | 186.2 |  |  | no Codex token block found in stderr | 2026-04-29T15:32:13.870719Z |

## 5. Parse Error Patterns

| error pattern | count | models affected | example slug |
| --- | --- | --- | --- |
| no Codex token block found in stderr | 947 | gpt-5.4, gpt-5.4-mini | 033-run-state-reconciliation |
| no Claude token counts found in stdout or stderr | 286 | claude-sonnet-4-6 | 033-run-state-reconciliation |
| no Gemini token stats found in stdout | 204 | gemini-2.5-pro | 033-run-state-reconciliation |

## 6. Duration vs Input Tokens Correlation

| model | input_token_bin | count | p50_duration_s | p95_duration_s |
| --- | --- | --- | --- | --- |
| gpt-5.4-mini | q1 [40-40] | 1 | 145.5 | 145.5 |
| gpt-5.4-mini | q2 [41-41] | 2 | 158.4 | 161.5 |
| gpt-5.4-mini | q3 [1500-1500] | 2 | 158.1 | 177.8 |
| gpt-5.4-mini | q4 [1500-1500] | 2 | 152.6 | 177.3 |
| gpt-5.4-mini | q5 [1500-1500] | 2 | 180.0 | 180.0 |

## 7. Wall Clock by Slug (Top 20)

| slug | total_review_duration_s | total_judge_duration_s | total_deferred_round_duration_s | rounds | stages_reaching_judge_cap |
| --- | --- | --- | --- | --- | --- |
| sensitivity-table-redesign-v2 | 10938.8 | 0.0 | 0.0 | 7 | 0 |
| match-pair-counts | 4160.8 | 2400.4 | 237.5 | 9 | 2 |
| ff-runner-fixes | 3624.1 | 2251.2 | 0.0 | 10 | 1 |
| ff-codex-reintegration | 1649.8 | 2441.6 | 0.0 | 11 | 1 |
| sensitivity-table-redesign | 3628.0 | 0.0 | 0.0 | 10 | 0 |
| remove-decision-code | 3188.8 | 412.0 | 0.0 | 6 | 0 |
| 033-run-state-reconciliation | 2523.6 | 992.3 | 0.0 | 7 | 1 |
| ff-token-reliability | 2566.5 | 444.8 | 1044.6 | 7 | 0 |
| paired-batch-count-min-of-two | 2613.2 | 0.0 | 0.0 | 6 | 0 |
| ff-safety-net | 1292.0 | 1118.5 | 0.0 | 8 | 0 |
| coverage-cell-batch-display | 1324.1 | 899.4 | 0.0 | 8 | 0 |
| circumplex-report | 1981.1 | 239.1 | 0.0 | 6 | 0 |
| visitor-role-access-control | 1370.7 | 835.3 | 0.0 | 6 | 1 |
| decision-cache-single-source | 715.7 | 1359.4 | 0.0 | 3 | 1 |
| pressure-sensitivity-report | 1903.0 | 0.0 | 0.0 | 4 | 2 |
| decision-cache-v2-tolerance | 1503.7 | 0.0 | 0.0 | 2 | 0 |
| ff-reconciliation-hardening | 1417.7 | 0.0 | 61.7 | 12 | 4 |
| ff-quality-of-life | 1229.5 | 0.0 | 379.2 | 5 | 0 |
| aggregate-consistency-data | 849.7 | 0.0 | 0.0 | 3 | 0 |
| ff-housekeeping | 787.7 | 0.0 | 0.0 | 5 | 0 |

## 8. Data Quality

- Dropped records: 0
- Dropped-record field breakdown: none
- Partial-but-kept field breakdown: input_tokens=1437, output_tokens=1437
- Slugs with malformed state.json: 035-audit-sweep
- Slugs with missing or non-list token_usage: 030-remove-legacy-decision-code, 031-settings-nav-restructure, 032-queue-depth-governor, analysis-condition-detail-canonical-v2, analysis-report-v2-guard, analysis-reports-decision-score-phase1, analysis-scenarios-canonical-ui, balance-ui-merge, byvalue-two-step-winrate, ci-test-quality, domain-analysis-freshness-cache, domain-analysis-value-detail-v2, domain-coverage-completeness-guard, domain-evaluation-model-backfill, domain-evaluation-setup-state, feature-workflow-discovery-shaping, feature-workflow-repair, i7-structured-discovery, i7-wave2-runner-extension, models-consistency-report, models-tab, native-body-scroll, parallel-implement-command, reasoning-token-costs, remove-final-trial-sampler, replace, split-status-start-pages, stall-watchdog, summarization-cache, summarizer-fallback-removal, transcript-decision-model-winner-first, transcript-summarization-speedup, unified-net-weighted-condition-score, vignette-analysis-decision-model, vignette-analysis-domain-overview-ui, vignette-analysis-group1-ui, workflow-runner-hardening
- Records with timestamps outside reasonable range: 0
- Malformed review files skipped during deferred-round scan: 0
- Deferred-round inference failures: 8
- Records without unambiguous lens attribution: 1186
- Estimated USD cost is a lower bound because 1437 calls had parse errors and null costs were treated as $0.
- Lens attribution is best-effort only. Current token_usage records do not reliably carry a per-call lens id across repeated rounds.
