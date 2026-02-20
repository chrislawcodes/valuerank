#!/usr/bin/env node
// Build raw-data.csv from individual run data files
// Usage: node build-csv.js

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const CSV_PATH = path.join(OUTPUT_DIR, 'raw-data.csv');

// Read all run-data-*.json files
const files = fs.readdirSync(OUTPUT_DIR)
  .filter(f => f.startsWith('run-data-') && f.endsWith('.json'))
  .sort();

console.log(`Found ${files.length} run data files`);

const header = 'vignette_name,vignette_id,run_id,value_a,value_b,model_id,decision_code,value_a_outcome,value_b_outcome';
const rows = [header];

let totalTranscripts = 0;
let skippedTranscripts = 0;
const allModels = new Set();
const allValues = new Set();
const vignetteStats = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8'));
  const { runId, definitionId, name, value_a, value_b, transcripts } = data;

  allValues.add(value_a);
  allValues.add(value_b);

  let validCount = 0;
  let skipCount = 0;

  for (const t of transcripts) {
    const dc = t.decisionCode;

    // Skip null, error, or non-numeric decision codes
    if (dc == null || dc === 'error' || dc === '' || isNaN(Number(dc))) {
      skipCount++;
      skippedTranscripts++;
      continue;
    }

    const decisionCode = Number(dc);
    let value_a_outcome, value_b_outcome;

    if (decisionCode === 4 || decisionCode === 5) {
      value_a_outcome = 'prioritized';
      value_b_outcome = 'deprioritized';
    } else if (decisionCode === 1 || decisionCode === 2) {
      value_a_outcome = 'deprioritized';
      value_b_outcome = 'prioritized';
    } else if (decisionCode === 3) {
      value_a_outcome = 'neutral';
      value_b_outcome = 'neutral';
    } else {
      skipCount++;
      skippedTranscripts++;
      continue;
    }

    allModels.add(t.modelId);

    // Escape CSV fields with commas or quotes
    const escapeCsv = (val) => {
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    rows.push([
      escapeCsv(name),
      definitionId,
      runId,
      value_a,
      value_b,
      t.modelId,
      decisionCode,
      value_a_outcome,
      value_b_outcome,
    ].join(','));

    validCount++;
    totalTranscripts++;
  }

  vignetteStats.push({ name, validCount, skipCount, total: transcripts.length });
}

fs.writeFileSync(CSV_PATH, rows.join('\n') + '\n', 'utf-8');

console.log('\n=== SUMMARY ===');
console.log(`Total rows written: ${totalTranscripts}`);
console.log(`Total skipped transcripts: ${skippedTranscripts}`);
console.log(`Number of vignettes: ${files.length}`);
console.log(`Number of unique models: ${allModels.size}`);
console.log(`Unique models: ${Array.from(allModels).sort().join(', ')}`);
console.log(`Number of unique values: ${allValues.size}`);
console.log(`Unique values: ${Array.from(allValues).sort().join(', ')}`);
console.log(`\nCSV written to: ${CSV_PATH}`);

// Check for incomplete vignettes
const incomplete = vignetteStats.filter(v => v.validCount < 250);
if (incomplete.length > 0) {
  console.log('\n=== INCOMPLETE VIGNETTES ===');
  for (const v of incomplete) {
    console.log(`  ${v.name}: ${v.validCount} valid, ${v.skipCount} skipped, ${v.total} total`);
  }
} else {
  console.log('\nAll vignettes have complete data (250+ valid transcripts).');
}
