# Tasks: Domain-Agnostic Decision Model

## Slice 1: Shared foundation + decision model + paired-definition

### 1.1 assemble-template.ts — remove job-choice defaults
- [ ] Remove `DEFAULT_LABEL_PREFIX` constant
- [ ] Change `labelFromBody(body: string, labelPrefix?: string | null)` → `labelFromBody(body: string, labelPrefix: string)`
- [ ] In `assembleTemplate`, pass `config?.labelPrefix ?? ''` to `labelFromBody` (empty string = no prefix, caller should always provide config)
- [ ] Update existing tests in `assemble-template.test.ts` to pass explicit labelPrefix
- [ ] Build shared: `npm run build --workspace @valuerank/shared`

### 1.2 decision-model.ts — snapshot-based config extraction
- [ ] Add helper `extractValueStatementsFromSnapshot(snapshot)` → reads `components.value_first` and `value_second`, returns `ValueStatementEntry[]` or null
- [ ] Add helper `extractLabelPrefixFromSnapshot(snapshot)` → parses scale labels from template text, returns string or null
- [ ] Remove `VALUE_STATEMENTS_BY_FAMILY` lookup table (added in the earlier quick fix)
- [ ] In `resolveTranscriptDecisionModel`, call new helpers and pass results to `resolveDecisionModel`
- [ ] Fallback: if snapshot lacks components or scale labels, pass undefined (existing behavior)
- [ ] Update/add tests in `decision-model.test.ts` with software-approach-choice snapshot data
- [ ] Build api: `npm run build --workspace @valuerank/api`

### 1.3 paired-definition.ts — pass TemplateConfig to assembleTemplate
- [ ] Add `TEMPLATE_CONFIG_BY_FAMILY` lookup with sentencePrefix + labelPrefix for job-choice and software-approach-choice
- [ ] Pass config to `assembleTemplate(intro, normalizedComponents, undefined, config)` at line 74
- [ ] Build api: `npm run build --workspace @valuerank/api`

### 1.4 Update remaining callers of labelFromBody
- [ ] `DomainSettingsPanel.tsx` — already passes prefix, just update for new required signature if needed
- [ ] `job-choice-transform.ts` — pass explicit `'taking the job with'`
- [ ] Build web: `npm run build --workspace @valuerank/web`

[CHECKPOINT]

## Slice 2: TranscriptRow display + end-to-end verification

### 2.1 TranscriptRow.tsx — domain-aware label parsing
- [ ] Replace `extractShortDirection` — instead of hardcoded `' taking '`, detect the strength prefix ("Strongly support", "Somewhat support", "Neutral / Unsure") and truncate there
- [ ] Replace hardcoded `' taking the job with '` marker — extract label prefix dynamically from `scaleLabels` in decisionMetadata
- [ ] Use extracted prefix for subject extraction
- [ ] Fallback gracefully when prefix can't be determined

### 2.2 End-to-end verification with real transcript data
- [ ] Capture representative transcript data from prod for both job-choice and software-approach-choice
- [ ] Write or run tests verifying `resolveCanonicalDecision` produces correct results for both
- [ ] Verify `TranscriptRow` display logic produces correct output for both label formats

### 2.3 Preflight
- [ ] `npm run lint` for shared, db, api, web
- [ ] `npm run test` for api, web
- [ ] `npm run build` for shared, api, web

[CHECKPOINT]
