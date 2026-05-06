import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const baselinesDir = resolve(here, '..', 'tests', 'snapshot-baselines');

type Snapshot = {
  name: string;
  queryFile: string;
  responseFile: string;
  variables: Record<string, unknown>;
  volatileFields: string[];
  drivesPages: string[];
  note?: string;
};

type Manifest = {
  description: string;
  filterContext: Record<string, string>;
  capturedAt: string;
  snapshots: Snapshot[];
};

type Diff = { path: string; expected: unknown; actual: unknown };

function loadManifest(): Manifest {
  const raw = readFileSync(join(baselinesDir, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Manifest;
}

function stripVolatile(value: unknown, paths: string[]): unknown {
  if (paths.length === 0) return value;
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  for (const path of paths) {
    deletePath(cloned, path.split('.'));
  }
  return cloned;
}

function deletePath(obj: unknown, segments: string[]): void {
  if (segments.length === 0 || obj == null || typeof obj !== 'object') return;
  const [head, ...rest] = segments;
  if (head === undefined) return;
  const record = obj as Record<string, unknown>;
  if (rest.length === 0) {
    delete record[head];
    return;
  }
  if (head in record) {
    deletePath(record[head], rest);
  }
}

function diff(expected: unknown, actual: unknown, path = '', out: Diff[] = [], cap = 25): Diff[] {
  if (out.length >= cap) return out;
  if (Object.is(expected, actual)) return out;
  if (
    expected === null || actual === null
    || typeof expected !== 'object' || typeof actual !== 'object'
  ) {
    out.push({ path: path || '<root>', expected, actual });
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      out.push({
        path: path || '<root>',
        expected: Array.isArray(expected) ? `array(len=${expected.length})` : expected,
        actual: Array.isArray(actual) ? `array(len=${actual.length})` : actual,
      });
      return out;
    }
    for (let i = 0; i < expected.length; i += 1) {
      diff(expected[i], actual[i], `${path}[${i}]`, out, cap);
      if (out.length >= cap) return out;
    }
    return out;
  }
  const expectedKeys = Object.keys(expected as object);
  const actualKeys = Object.keys(actual as object);
  const allKeys = new Set([...expectedKeys, ...actualKeys]);
  for (const key of allKeys) {
    const ev = (expected as Record<string, unknown>)[key];
    const av = (actual as Record<string, unknown>)[key];
    diff(ev, av, path === '' ? key : `${path}.${key}`, out, cap);
    if (out.length >= cap) return out;
  }
  return out;
}

async function fetchProd(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const url = process.env.PROD_GRAPHQL_URL;
  const apiKey = process.env.PROD_API_KEY;
  if (url == null || url === '') throw new Error('PROD_GRAPHQL_URL env var is required');
  if (apiKey == null || apiKey === '') throw new Error('PROD_API_KEY env var is required');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
  }
  return response.json();
}

async function verifySnapshot(snapshot: Snapshot): Promise<{ name: string; passed: boolean; diffs: Diff[] }> {
  const queryText = readFileSync(join(baselinesDir, snapshot.queryFile), 'utf8');
  const expectedRaw = JSON.parse(readFileSync(join(baselinesDir, snapshot.responseFile), 'utf8'));
  const actualRaw = await fetchProd(queryText, snapshot.variables);
  const expected = stripVolatile(expectedRaw, snapshot.volatileFields);
  const actual = stripVolatile(actualRaw, snapshot.volatileFields);
  const diffs = diff(expected, actual);
  return { name: snapshot.name, passed: diffs.length === 0, diffs };
}

async function main(): Promise<void> {
  const manifest = loadManifest();
  console.log(`Verifying ${manifest.snapshots.length} report snapshots against production.`);
  console.log(`Filter context: signature=${manifest.filterContext.signature}, scope=${manifest.filterContext.domainScope}, models=${manifest.filterContext.modelSelection}`);
  console.log('');

  const results = await Promise.all(manifest.snapshots.map((s) => verifySnapshot(s)));

  let failed = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`PASS  ${result.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${result.name} — ${result.diffs.length} difference${result.diffs.length === 1 ? '' : 's'}`);
      for (const d of result.diffs.slice(0, 10)) {
        console.log(`        at ${d.path}`);
        console.log(`          expected: ${JSON.stringify(d.expected).slice(0, 200)}`);
        console.log(`          actual:   ${JSON.stringify(d.actual).slice(0, 200)}`);
      }
      if (result.diffs.length > 10) {
        console.log(`        ...and ${result.diffs.length - 10} more`);
      }
    }
  }

  console.log('');
  if (failed === 0) {
    console.log('All snapshots match production.');
    process.exit(0);
  } else {
    console.error(`${failed} snapshot${failed === 1 ? '' : 's'} differ from production.`);
    console.error('If the change is intentional: run "npm run verify-report-snapshots:update" (TODO) and commit the new fixtures in a reviewed PR.');
    console.error('If the change is unexpected: investigate before deploying further changes.');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('verify-report-snapshots crashed:', err);
  process.exit(2);
});
