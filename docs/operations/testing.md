# Testing Guide

> **Part of [Cloud ValueRank Documentation](../README.md)**

Cloud ValueRank uses a comprehensive testing strategy with Vitest for TypeScript/JavaScript and pytest for Python workers.

---

## Test Structure Overview

```
cloud/
├── apps/
│   ├── api/
│   │   ├── tests/                 # API tests
│   │   │   ├── setup.ts           # Test environment setup
│   │   │   ├── graphql/           # GraphQL query/mutation tests
│   │   │   ├── routes/            # REST endpoint tests
│   │   │   ├── queue/             # Job handler tests
│   │   │   ├── mcp/               # MCP server tests
│   │   │   ├── services/          # Business logic tests
│   │   │   └── integration/       # End-to-end tests
│   │   └── vitest.config.ts
│   └── web/
│       ├── tests/                 # Frontend tests
│       │   ├── setup.ts
│       │   └── components/
│       └── vitest.config.ts
├── packages/
│   ├── db/
│   │   ├── tests/                 # Database query tests
│   │   │   └── setup.ts
│   │   └── vitest.config.ts
│   └── shared/
│       ├── tests/
│       └── vitest.config.ts
└── workers/
    └── tests/                     # Python worker tests
        ├── conftest.py            # pytest fixtures
        ├── test_probe.py
        ├── test_analyze_basic.py
        └── test_summarize.py
```

---

## Running Tests

### Quick Commands

```bash
# From cloud/ directory

# Run all tests (sets up test DB automatically)
npm test

# Run with coverage
npm run test:coverage

# Run specific package
npm test --workspace=@valuerank/api
npm test --workspace=@valuerank/web
npm test --workspace=@valuerank/db

# Run Python worker tests
cd workers && PYTHONPATH=. pytest tests/ -v
```

### Manual Test Database Setup

Tests automatically use the test database (`valuerank_test`). If you need to set it up manually:

```bash
# Push schema to test database
npm run db:test:setup

# Force reset (clears all data)
npm run db:test:reset
```

---

## Coverage Requirements

The project enforces minimum coverage thresholds defined in `CLAUDE.md`:

| Package | Lines | Branches | Functions |
|---------|-------|----------|-----------|
| **API** | 70% | 75% | 75% |
| **Web** | 80% | 75% | 65% |
| **DB** | - | - | - |

### Viewing Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open apps/api/coverage/index.html
open apps/web/coverage/index.html
```

---

## Test Database Configuration

### Safety Features

The test setup (`tests/setup.ts`) enforces test database isolation:

```typescript
// CRITICAL: Force test database - NEVER use production database in tests
const TEST_DATABASE_URL = 'postgresql://valuerank:valuerank@localhost:5433/valuerank_test';

// Safety check: Fail fast if somehow pointing to production database
const currentDbUrl = process.env.DATABASE_URL || '';
if (currentDbUrl && !currentDbUrl.includes('_test')) {
  console.error('CRITICAL: Tests attempted to use non-test database!');
}

// ALWAYS use test database
process.env.DATABASE_URL = TEST_DATABASE_URL;
```

### Environment Variables for Tests

```bash
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
JWT_SECRET="test-secret-that-is-at-least-32-characters-long"
```

---

## TypeScript Tests (Vitest)

### API Tests

Located in `apps/api/tests/`. Categories include:

| Directory | Purpose | Example |
|-----------|---------|---------|
| `graphql/queries/` | Query resolver tests | `definition.test.ts` |
| `graphql/mutations/` | Mutation tests | `run.test.ts` |
| `graphql/dataloaders/` | DataLoader batching tests | `batching.test.ts` |
| `routes/` | REST endpoint tests | `auth.test.ts` |
| `queue/handlers/` | Job handler tests | `probe-scenario.test.ts` |
| `mcp/tools/` | MCP tool tests | `list-definitions.test.ts` |
| `services/` | Business logic tests | `analysis/cache.test.ts` |
| `integration/` | End-to-end tests | `md-roundtrip.test.ts` |

### Running Specific Tests

```bash
# Run single test file
npx vitest run tests/graphql/queries/definition.test.ts

# Run tests matching pattern
npx vitest run --filter "definition"

# Watch mode for development
npx vitest --watch tests/graphql/
```

### API Test Configuration

From `apps/api/vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Run tests sequentially for database isolation
    fileParallelism: false,
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

### Web Tests

Located in `apps/web/tests/`. Uses jsdom environment for React component testing.

```typescript
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

---

## Python Tests (pytest)

### Running Python Tests

```bash
cd workers

# Run all tests
PYTHONPATH=. pytest tests/ -v

# Run specific test file
PYTHONPATH=. pytest tests/test_probe.py -v

# Run with coverage
PYTHONPATH=. pytest tests/ --cov=. --cov-report=html
```

### Test Files

| File | Tests |
|------|-------|
| `test_probe.py` | Scenario probing, LLM interaction |
| `test_analyze_basic.py` | Tier 1 analysis logic |
| `test_summarize.py` | Transcript summarization |
| `test_llm_adapters.py` | Provider adapter functions |
| `test_health_check.py` | Worker health verification |
| `test_errors.py` | Error handling and reporting |
| `test_stats.py` | Statistical calculations |
| `test_cost_tracking.py` | Token cost computation |
| `test_rate_limit.py` | Rate limiting behavior |

### Fixtures

Common fixtures in `conftest.py`:

```python
@pytest.fixture
def mock_llm_response():
    """Mock LLM API response for testing."""
    return {
        "choices": [{"message": {"content": "Test response"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20}
    }
```

---

## Writing Tests

### Test Structure (AAA Pattern)

```typescript
describe('DefinitionService', () => {
  describe('create', () => {
    it('creates a definition with valid content', async () => {
      // Arrange
      const content = { name: 'Test', preamble: '...' };

      // Act
      const result = await definitionService.create(content);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test');
    });
  });
});
```

### Database Test Isolation

For tests that modify the database:

```typescript
import { db } from '@valuerank/db';

describe('RunMutations', () => {
  let testDefinition: Definition;

  beforeAll(async () => {
    // Create test data
    testDefinition = await db.definition.create({
      data: { /* ... */ }
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.definition.delete({
      where: { id: testDefinition.id }
    });
  });

  it('creates a run', async () => {
    // Test uses testDefinition
  });
});
```

### Mocking PgBoss

Tests that trigger queue jobs need to mock PgBoss:

```typescript
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    getQueueSize: vi.fn().mockResolvedValue(0),
  }),
}));
```

### Mocking LLM Providers

For tests involving LLM calls:

```typescript
vi.mock('../../../src/services/llm', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: 'Mocked response',
    usage: { promptTokens: 10, completionTokens: 20 }
  }),
}));
```

---

## Common Test Patterns

### GraphQL Query Test

```typescript
import { createTestContext } from '../test-utils';
import { execute } from '../../../src/graphql/schema';

describe('Query.definition', () => {
  it('returns definition by id', async () => {
    const context = createTestContext({ userId: 'test-user' });

    const result = await execute({
      document: gql`
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
          }
        }
      `,
      variables: { id: 'test-id' },
      context,
    });

    expect(result.data?.definition.name).toBe('Expected Name');
  });
});
```

### REST Endpoint Test

```typescript
import request from 'supertest';
import { app } from '../../../src/server';

describe('POST /api/auth/login', () => {
  it('returns token with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@valuerank.ai', password: 'development' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
  });
});
```

### Integration Test

```typescript
describe('Markdown Roundtrip', () => {
  it('exports and imports definition without data loss', async () => {
    // Create definition
    const original = await createDefinition(testContent);

    // Export to markdown
    const markdown = await exportDefinitionMd(original.id);

    // Import back
    const imported = await importDefinitionMd(markdown);

    // Verify identical content
    expect(imported.content).toEqual(original.content);
  });
});
```

---

## Troubleshooting

### "column X does not exist"

Schema out of sync with test database:

```bash
npm run db:test:setup
```

### Foreign key constraint violations

Data pollution from previous test runs:

```bash
npm run db:test:reset
```

### "PgBoss not initialized"

Test needs to mock PgBoss. Add to test file:

```typescript
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  }),
}));
```

### Test isolation issues

Use unique identifiers or upsert patterns:

```typescript
// Use timestamp in test data names
const testId = `test-${Date.now()}`;

// Or use upsert for shared fixtures
await db.tag.upsert({
  where: { name: 'test-tag' },
  update: {},
  create: { name: 'test-tag' },
});
```

### Tests timing out

Increase timeout in test file:

```typescript
it('long running test', async () => {
  // ...
}, 30000); // 30 second timeout
```

---

## CI/CD Integration

Tests run in GitHub Actions on pull requests and main branch pushes:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: valuerank
          POSTGRES_PASSWORD: valuerank
          POSTGRES_DB: valuerank_test
        ports:
          - 5433:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

---

## Related Documentation

- [Local Development](./local-development.md) - Development setup
- [Deployment Guide](./deployment.md) - Production deployment
- [CLAUDE.md](../../CLAUDE.md) - Coding standards and coverage requirements
