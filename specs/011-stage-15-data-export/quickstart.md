# Quickstart: Data Export & CLI Compatibility

## Prerequisites

- [ ] Development environment running (`npm run dev`)
- [ ] PostgreSQL database running (`docker-compose up -d postgres`)
- [ ] Test data available (run `npm run db:seed`)
- [ ] User logged in with valid JWT
- [ ] At least one definition with generated scenarios
- [ ] At least one completed run with transcripts

---

## Testing User Story 1: Export Definition as Markdown

**Goal**: Verify a definition can be exported to devtool-compatible MD format.

**Steps**:

1. Navigate to Definitions page in web UI
2. Click on a definition to view details
3. Click "Export" dropdown → "Export as Markdown"
4. Browser downloads `.md` file

**Expected**:
- File downloads with name `{definition-name}.md`
- File contains YAML frontmatter with `name`, `base_id`, `category`
- File contains `# Preamble` section with definition preamble
- File contains `# Template` section with template text
- File contains `# Dimensions` section with markdown tables for each dimension
- File contains `# Matching Rules` section if matching rules exist

**Verification**:

```bash
# Copy the devtool MD parser to test
cd devtool
node -e "
const { parseScenarioMd } = require('./src/server/utils/scenarioMd.js');
const fs = require('fs');
const content = fs.readFileSync('/path/to/exported.md', 'utf-8');
const parsed = parseScenarioMd(content);
console.log(JSON.stringify(parsed, null, 2));
"
```

---

## Testing User Story 2: Import Definition from Markdown

**Goal**: Verify an MD file from devtool can be imported into Cloud.

**Steps**:

1. Navigate to Definitions page
2. Click "Import Definition" button
3. Select or drag-drop a `.md` file from devtool
4. Preview shows parsed content
5. Optionally rename or select as fork of existing
6. Click "Import"

**Expected**:
- Preview shows parsed preamble, template, dimensions
- Validation errors shown if file is malformed
- New definition created on success
- Redirects to new definition detail page
- Definition content matches original file

**Verification**:

```graphql
# Query the newly created definition
query {
  definition(id: "<new-definition-id>") {
    name
    resolvedContent
  }
}
```

---

## Testing User Story 3: Export Scenarios as CLI-Compatible YAML

**Goal**: Verify scenarios can be exported for use with CLI `probe.py`.

**Steps**:

1. Navigate to a definition with generated scenarios
2. Click "Export" dropdown → "Export Scenarios (YAML)"
3. Browser downloads `.yaml` file

**Expected**:
- File downloads with name `{definition-name}.scenarios.yaml`
- File contains root `preamble` field with definition preamble
- File contains `scenarios` object with entries for each scenario
- Each scenario has `base_id`, `category`, `subject`, `body`
- Body uses YAML block scalar notation (`|`) for multi-line

**Verification**:

```bash
# Test with CLI probe.py (dry-run)
cd /path/to/valuerank
python3 -c "
import yaml
with open('/path/to/exported.scenarios.yaml') as f:
    data = yaml.safe_load(f)
print('Preamble:', data['preamble'][:100], '...')
print('Scenario count:', len(data['scenarios']))
for name, scenario in list(data['scenarios'].items())[:2]:
    print(f'  {name}: {scenario[\"subject\"][:50]}...')
"
```

---

## Testing User Story 4: Export Run Results (Bulk)

**Goal**: Verify bulk export of run transcripts as JSON Lines.

**Steps**:

1. Navigate to Runs page
2. Click on a completed run
3. Click "Export" dropdown → "Export as JSON Lines"
4. For large runs: Shows export job started, poll for completion
5. Download when ready

**Expected**:
- For small runs: Immediate download
- For large runs: Job status shown, download link when complete
- Each line in file is valid JSON with transcript data
- Contains: scenario_id, model_id, decision_code, decision_text, dimensions

**Verification**:

```bash
# Verify JSON Lines format
head -n 5 /path/to/export.jsonl | jq .

# Count records
wc -l /path/to/export.jsonl
```

---

## Testing User Story 5: Export Full Run Bundle (CLI Format)

**Goal**: Verify run can be exported in CLI-compatible directory structure.

**Steps**:

1. Navigate to a completed run detail page
2. Click "Export" dropdown → "Export as CLI Bundle"
3. For large runs: Job starts, poll for completion
4. Download ZIP file when ready

**Expected**:
- ZIP file downloads with name `run_{id}_{date}.zip`
- Contains `manifest.yaml` with run metadata
- Contains `transcripts/` directory
- Each transcript is a `.md` file with YAML frontmatter
- Manifest includes model mapping

**Verification**:

```bash
# Extract and verify structure
unzip -l /path/to/run_export.zip

# Check manifest
unzip -p /path/to/run_export.zip manifest.yaml | head -20

# Check a transcript
unzip -p /path/to/run_export.zip "transcripts/*.md" | head -30
```

---

## Testing User Story 6: Download URL Expiry

**Goal**: Verify download URLs expire correctly.

**Steps**:

1. Create a large export that goes async
2. Wait for completion, note the download URL
3. Verify download works immediately
4. Wait past expiry time (or manually set short expiry)
5. Attempt download again

**Expected**:
- Download works within expiry period
- After expiry: Returns HTTP 410 Gone
- Error message indicates "Download link expired"

**Verification**:

```bash
# Test download URL
curl -I "https://api.example.com/api/export/download/{job-id}"

# Expected after expiry:
# HTTP/2 410
# Content-Type: application/json
# {"error": "DOWNLOAD_EXPIRED", "message": "Download link expired"}
```

---

## Testing User Story 7: Import Scenarios from YAML

**Goal**: Verify CLI-format YAML scenarios can be imported.

**Steps**:

1. Have a CLI-format `.yaml` file from existing scenarios
2. Navigate to Import page
3. Select "Import Scenarios (YAML)"
4. Upload the file
5. Select existing definition or create new
6. Click "Import"

**Expected**:
- Parser extracts preamble and scenarios
- Scenarios created linked to definition
- Count of imported scenarios shown
- Can view scenarios in definition detail

**Verification**:

```graphql
query {
  definition(id: "<definition-id>") {
    scenarioCount
    scenarios {
      name
      content
    }
  }
}
```

---

## Troubleshooting

**Issue**: MD export missing dimensions
**Fix**: Ensure definition has `dimensions` in `resolvedContent` (check inheritance)

**Issue**: YAML import fails with parsing error
**Fix**: Validate YAML syntax, ensure proper indentation and block scalars

**Issue**: Export job stuck in PENDING
**Fix**: Check worker is running (`npm run dev` should start workers)

**Issue**: Download returns 404
**Fix**: Check job status is COMPLETED, verify file path exists

**Issue**: Large export times out
**Fix**: Exports >1000 records should use async job system, check job queue
