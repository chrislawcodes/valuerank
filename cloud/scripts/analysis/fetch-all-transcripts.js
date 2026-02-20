#!/usr/bin/env node
/**
 * Fetch all transcript data for 45 Jobs vignette runs and write raw-data.csv
 *
 * Uses the local GraphQL API to fetch data efficiently.
 * Requires: JWT token for authentication
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3031/graphql';
const OUTPUT_DIR = path.join(__dirname, 'output');
const CSV_PATH = path.join(OUTPUT_DIR, 'raw-data.csv');

// Generate JWT token
function generateToken() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { sub: 'cmixy5vz90000l8tv2t6ar0vc', email: 'dev@valuerank.ai' },
    'dev-secret-key-for-local-development-only-32chars',
    { expiresIn: '1h' }
  );
}

async function graphqlQuery(query, token) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// The 45 runs we identified (newest run per definition with 250-300 transcripts)
const RUNS = [
  { id: "cmltv134f13d5p9cxecjywtx0", definitionId: "cmlsmyn9l0j3rxeiricruouia", name: "Jobs (Self Direction Action vs Power Dominance)" },
  { id: "cmltv0bb113cap9cx4rjgnmhv", definitionId: "cmlsmyyzl0j4hxeir8pqjvuco", name: "Jobs (Self Direction Action vs Security Personal)" },
  { id: "cmltuzl64134fp9cxdu82npjd", definitionId: "cmlsmz2tx0j57xeirfb6wfof4", name: "Jobs (Self Direction Action vs Conformity Interpersonal)" },
  { id: "cmltuywba12lwp9cxcu577cb1", definitionId: "cmlsmz6b80j5xxeirs9x8zswh", name: "Jobs (Self Direction Action vs Tradition)" },
  { id: "cmltuy61f120hp9cx6r0mb4xw", definitionId: "cmlsmz9jt0j6nxeirvtafwl0a", name: "Jobs (Self Direction Action vs Stimulation)" },
  { id: "cmltuwmdw10xap9cx79zqey3e", definitionId: "cmlsmzcj00j7dxeirly5k7z0x", name: "Jobs (Self Direction Action vs Benevolence Dependability)" },
  { id: "cmltuvrhq109bp9cx8e52g009", definitionId: "cmlsmzfgm0j83xeir4wvby0ru", name: "Jobs (Self Direction Action vs Universalism Nature)" },
  { id: "cmltuuwgt0zmcp9cx1gxb4cgs", definitionId: "cmlsmzif70j8txeirrsw0ommj", name: "Jobs (Self Direction Action vs Achievement)" },
  { id: "cmltuu1is0z0hp9cxmsh3mra6", definitionId: "cmlsmzlbg0j9jxeirhpzpz4f2", name: "Jobs (Self Direction Action vs Hedonism)" },
  { id: "cmltut53e0ybip9cxki1z8n3s", definitionId: "cmlsmztzp0ja9xeirsi8adqjo", name: "Jobs (Power Dominance vs Security Personal)" },
  { id: "cmltusevs0xsbp9cx4nfr6niw", definitionId: "cmlsmzxts0jazxeir2vk5jc9r", name: "Jobs (Power Dominance vs Conformity Interpersonal)" },
  { id: "cmlturoiz0x8cp9cxls13hafl", definitionId: "cmlsn01fp0jbpxeirfxofqzp1", name: "Jobs (Power Dominance vs Tradition)" },
  { id: "cmltuqy7l0wolp9cxenhaoyr0", definitionId: "cmlsn04vw0jcfxeir9f88utlw", name: "Jobs (Power Dominance vs Stimulation)" },
  { id: "cmltuq9hh0w56p9cxzsylz7op", definitionId: "cmlsn07ay0jd5xeira814cpgh", name: "Jobs (Power Dominance vs Benevolence Dependability)" },
  { id: "cmltuoz320uvjp9cx15fxxek7", definitionId: "cmlsn0a8u0jdvxeir30j1t96q", name: "Jobs (Power Dominance vs Universalism Nature)" },
  { id: "cmltunzjf0tvsp9cx0m29o0b9", definitionId: "cmlsn0d2k0jelxeir192w21y4", name: "Jobs (Power Dominance vs Achievement)" },
  { id: "cmltun65l0t41p9cxaw7nfim6", definitionId: "cmlsn0gaf0jfbxeirchtbq6yf", name: "Jobs (Power Dominance vs Hedonism)" },
  { id: "cmltumcrv0sbup9cx9462szj7", definitionId: "cmlsn0pnr0jg1xeir147758pr", name: "Jobs (Security Personal vs Conformity Interpersonal)" },
  { id: "cmltulo2b0rnbp9cxdduwhty0", definitionId: "cmlsn0t860jgrxeir776k9439", name: "Jobs (Security Personal vs Tradition)" },
  { id: "cmltukxrj0qxop9cxpgepyfqt", definitionId: "cmlsn0wca0jhhxeirdxiu8mtb", name: "Jobs (Security Personal vs Stimulation)" },
  { id: "cmltuk7ik0q7pp9cxac61xvr4", definitionId: "cmlsn0zlf0ji7xeiravcd5oio", name: "Jobs (Security Personal vs Benevolence Dependability)" },
  { id: "cmltujh6x0phqp9cxm0sju1n3", definitionId: "cmlsn12j60jixxeirql0k3a5n", name: "Jobs (Security Personal vs Universalism Nature)" },
  { id: "cmltuiqx30oopp9cxh2ivsxyq", definitionId: "cmlsn1bs40jl3xeiri7j3jrvb", name: "Jobs (Conformity Interpersonal vs Tradition)" },
  { id: "cmltui27m0o04p9cxktxwp1ea", definitionId: "cmlsn15po0jjnxeirfxvwrt3s", name: "Jobs (Security Personal vs Achievement)" },
  { id: "cmltuhbz00nc5p9cxv5k5848u", definitionId: "cmlsn18ho0jkdxeirzumtgpm9", name: "Jobs (Security Personal vs Hedonism)" },
  { id: "cmltufizz0lbip9cxo3svupue", definitionId: "cmlsn1ffh0jltxeirfxtxdboh", name: "Jobs (Conformity Interpersonal vs Stimulation)" },
  { id: "cmltuekyo0k6fp9cx9kz6kwmk", definitionId: "cmlsn1iik0jmjxeirggiekxvu", name: "Jobs (Conformity Interpersonal vs Benevolence Dependability)" },
  { id: "cmltudrnc0j7op9cx4clvv20f", definitionId: "cmlsn1lch0jn9xeirt220zmq7", name: "Jobs (Conformity Interpersonal vs Universalism Nature)" },
  { id: "cmltucv540i5xp9cx8p89kf12", definitionId: "cmlsn1obw0jnzxeir185nw98k", name: "Jobs (Conformity Interpersonal vs Achievement)" },
  { id: "cmltuc1s90h9mp9cx2pa8jihe", definitionId: "cmlsn1rnk0jopxeir9vb5g18v", name: "Jobs (Conformity Interpersonal vs Hedonism)" },
  { id: "cmltub26z0g3fp9cxg061mch6", definitionId: "cmlsn216u0jpfxeirpdbrm9so", name: "Jobs (Tradition vs Stimulation)" },
  { id: "cmltua8w10f4gp9cxg8yn3ngb", definitionId: "cmlsn26410jq5xeirg3zt75zs", name: "Jobs (Tradition vs Benevolence Dependability)" },
  { id: "cmltu9e0s0e3xp9cxziplmpzi", definitionId: "cmlsn27zq0jqvxeir3sy7wen5", name: "Jobs (Tradition vs Universalism Nature)" },
  { id: "cmltu8j810d2up9cxvexh9lh2", definitionId: "cmlsn2b710jrlxeir730eyx8l", name: "Jobs (Tradition vs Achievement)" },
  { id: "cmltu7rcd0c6zp9cxrz9kg24e", definitionId: "cmlsn2dwy0jsbxeirs2bew2nq", name: "Jobs (Tradition vs Hedonism)" },
  { id: "cmltu71480b7mp9cxc0jom03b", definitionId: "cmlsn2h5u0jt1xeir4kwq3gvj", name: "Jobs (Stimulation vs Benevolence Dependability)" },
  { id: "cmltu66990a4lp9cxih5123wd", definitionId: "cmlsn2k3j0jtrxeir7nzsjdif", name: "Jobs (Stimulation vs Universalism Nature)" },
  { id: "cmltu5g0b0972p9cxtjd0ilob", definitionId: "cmlsn2nac0juhxeirqggbjcb6", name: "Jobs (Stimulation vs Achievement)" },
  { id: "cmltu4pqn08app9cx9jgpdlos", definitionId: "cmlsn2pz20jv7xeir18zthht5", name: "Jobs (Stimulation vs Hedonism)" },
  { id: "cmltu3q9b0798p9cxubfznfoj", definitionId: "cmlsn2tca0jvxxeir5r0i5civ", name: "Jobs (Benevolence Dependability vs Universalism Nature)" },
  { id: "cmltu300e06exp9cx91iu1skt", definitionId: "cmlsn2w8j0jwnxeirq7ubpg9f", name: "Jobs (Benevolence Dependability vs Achievement)" },
  { id: "cmltu1xf9057yp9cxuaqozseh", definitionId: "cmlsn2zga0jxdxeirbnu8s390", name: "Jobs (Benevolence Dependability vs Hedonism)" },
  { id: "cmltu17dq04f3p9cxoao8tc3i", definitionId: "cmlsn327s0jy3xeirzypdo8wz", name: "Jobs (Universalism Nature vs Achievement)" },
  { id: "cmlttzqpw02r4p9cxunxmlxe4", definitionId: "cmlsn358l0jytxeir3rbp25hy", name: "Jobs (Universalism Nature vs Hedonism)" },
  { id: "cmltpxe5u00566f2zilvyqcy2", definitionId: "cmlsn384i0jzjxeir9or2w35z", name: "Jobs (Achievement vs Hedonism)" },
];

function parseValuePair(name) {
  const match = name.match(/^Jobs \((.+) vs (.+)\)$/);
  if (!match) throw new Error(`Cannot parse value pair from: ${name}`);
  return {
    value_a: match[1].replace(/ /g, '_'),
    value_b: match[2].replace(/ /g, '_'),
  };
}

function escapeCsv(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  // Ensure output dir exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const token = generateToken();
  console.log('Generated JWT token');

  const header = 'vignette_name,vignette_id,run_id,value_a,value_b,model_id,decision_code,value_a_outcome,value_b_outcome';
  const rows = [header];

  let totalTranscripts = 0;
  let skippedTranscripts = 0;
  const allModels = new Set();
  const allValues = new Set();
  const vignetteStats = [];

  // Fetch transcripts for each run (5 at a time for parallelism)
  const BATCH_SIZE = 5;
  for (let i = 0; i < RUNS.length; i += BATCH_SIZE) {
    const batch = RUNS.slice(i, i + BATCH_SIZE);
    console.log(`Fetching runs ${i + 1}-${i + batch.length} of ${RUNS.length}...`);

    // Build aliased query for the batch
    const aliases = batch.map((run, j) => {
      return `r${j}: run(id: "${run.id}") { id transcripts(limit: 300) { modelId decisionCode } }`;
    }).join('\n    ');

    const query = `query { ${aliases} }`;
    const data = await graphqlQuery(query, token);

    for (let j = 0; j < batch.length; j++) {
      const run = batch[j];
      const runData = data[`r${j}`];

      if (!runData) {
        console.error(`  MISSING: ${run.name} (${run.id})`);
        vignetteStats.push({ name: run.name, validCount: 0, skipCount: 0, total: 0, error: 'missing' });
        continue;
      }

      const { value_a, value_b } = parseValuePair(run.name);
      allValues.add(value_a);
      allValues.add(value_b);

      let validCount = 0;
      let skipCount = 0;

      for (const t of runData.transcripts) {
        const dc = t.decisionCode;

        // Skip null, error, or non-numeric
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

        rows.push([
          escapeCsv(run.name),
          run.definitionId,
          run.id,
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

      vignetteStats.push({
        name: run.name,
        validCount,
        skipCount,
        total: runData.transcripts.length,
      });

      console.log(`  ${run.name}: ${validCount} valid, ${skipCount} skipped (${runData.transcripts.length} total)`);
    }
  }

  // Write CSV
  fs.writeFileSync(CSV_PATH, rows.join('\n') + '\n', 'utf-8');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total rows written: ${totalTranscripts}`);
  console.log(`Total skipped transcripts: ${skippedTranscripts}`);
  console.log(`Number of vignettes: ${vignetteStats.length}`);
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
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
