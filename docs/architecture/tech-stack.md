# Tech Stack

> Technologies used in ValueRank and the rationale for each choice.

---

## Overview

ValueRank is a TypeScript-first monorepo with Python workers for LLM-bound work. The stack prioritizes:

- **Developer experience** — hot reload, end-to-end types, familiar tools
- **Operational simplicity** — single Postgres, no separate worker process
- **Token efficiency** — GraphQL for flexible queries, token-budgeted MCP responses
- **Python interop** — workers reuse provider SDKs and analysis code from the original CLI pipeline

---

## Runtime & Package Management

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | JavaScript runtime |
| npm | 10+ | Package manager / workspaces |
| Turborepo | 2.x | Monorepo orchestration + caching |
| TypeScript | 5.3 | Type-safe JS |
| Python | 3.10+ | Workers for LLM and statistics |

---

## API Server (`apps/api`)

| Technology | Version | Purpose |
|------------|---------|---------|
| Express | 4.18 | HTTP server |
| GraphQL Yoga | 5.1 | GraphQL server |
| Pothos | 3.41 (`@pothos/core`, `plugin-prisma`, `plugin-validation`) | Code-first schema |
| DataLoader | 2.2 | N+1 prevention |
| Zod | 3.22 | Input validation |
| pg-boss | 12.5 | Postgres-backed job queue |
| `@modelcontextprotocol/sdk` | 1.24 | MCP server |
| jsonwebtoken | 9.0 | JWT auth |
| bcrypt | 5.1 | Password hashing |
| express-rate-limit | 7.1 | Request rate limiting |
| cors | 2.8 | CORS middleware (exposes `Content-Disposition`) |
| compression | 1.8 | gzip/br response compression |
| dotenv | 17.2 | Env loading for CLI scripts |
| adm-zip | 0.5 | Export bundle zipping |
| exceljs | 4.4 | XLSX export |
| bottleneck | 2.19 | Per-provider rate-limit / concurrency control |
| yaml | 2.8 | Definition import/export |

**Design notes:**

- **GraphQL over REST** — LLMs introspect the schema; single endpoint simplifies MCP and web auth.
- **Pothos over SDL-first** — type-safe, no schema drift, good IDE support.
- **Express over Fastify** — mature ecosystem and team familiarity outweigh Fastify's perf wins.
- **In-process PgBoss** — queue orchestrator runs inside the API; simpler deploy than a separate worker service.

```typescript
// Pothos example
const Definition = builder.prismaObject('Definition', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    content: t.field({ type: 'JSON', resolve: (d) => d.content }),
  }),
});
```

---

## Database (`packages/db`)

| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 15+ | Primary store |
| PgBouncer | — | Transaction-pooled connections for the app |
| Prisma | 5.7 | ORM / migrations / typed client |

**Rationale:**

- **PostgreSQL over MongoDB** — definition DAGs need recursive CTEs; JSONB gives schema flexibility without migrations; same DB serves the queue.
- **PgBouncer** — app goes through the pooler (`DATABASE_URL` with `?pgbouncer=true`, prepared statements off). Migrations use a direct connection (`DIRECT_URL`).
- **Prisma Migrate only** — never `db push` in shared envs. Production runs `prisma migrate deploy` on startup.

---

## Frontend (`apps/web`)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2 | UI framework |
| Vite | 5.0 | Dev server + bundler |
| TypeScript | 5.3 | Type safety |
| Tailwind CSS | 3.3 | Utility-first styling |
| urql | 4.0 | GraphQL client |
| `@urql/exchange-auth` | 2.1 | JWT auth exchange |
| GraphQL Code Generator | 6.x (`client-preset`, `typescript-urql`) | Typed documents from schema |
| React Router | 6.21 | Client-side routing |
| Monaco Editor | 4.7 | Definition editing |
| Recharts | 3.5 | Charts |
| `@tanstack/react-virtual` | 3.13 | Virtualized tables |
| Radix Popover | 1.1 | Accessible primitives |
| `class-variance-authority`, `clsx`, `tailwind-merge` | latest | Styling helpers |
| `date-fns` | 4.1 | Date formatting |
| `html-to-image`, `html2canvas` | latest | Chart export |
| Lucide | 0.294 | Icons |

**Rationale:**

- **Vite over CRA/Webpack** — fast HMR, ESM-native, minimal config.
- **urql over Apollo** — lighter, simpler cache; pairs well with GraphQL codegen.
- **Codegen workflow** — `npm run codegen` in `apps/web` writes `src/generated/`; `npm run verify` enforces that generated output is up to date.
- **Tailwind + CVA** — design tokens in Tailwind; component variants via `class-variance-authority`.

---

## Authentication

| Technology | Version | Purpose |
|------------|---------|---------|
| bcrypt | 5.1 | Password hashing |
| jsonwebtoken | 9.0 | JWT signing/verification |
| express-rate-limit | 7.1 | Brute-force protection |

**Auth channels:**

- **Web:** JWT (HTTP-only cookie).
- **Programmatic / MCP (legacy):** API keys (hashed in `api_keys`).
- **Remote MCP agents (Claude.ai / Claude Code / Codex):** OAuth 2.1 with PKCE and RFC 7591 Dynamic Client Registration. Metadata exposed at `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/oauth-protected-resource` (RFC 9728). Implementation in `apps/api/src/mcp/oauth/`.

---

## MCP Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| `@modelcontextprotocol/sdk` | 1.24 | MCP server protocol |

- **Transport:** Streamable HTTP at `POST /mcp` (remote) + stdio for local development.
- **Tools:** 40+ read/write tools live in `apps/api/src/mcp/tools/` (definitions, runs, models, queue, transcripts, pairwise outcomes, etc.). They reuse the GraphQL resolvers.
- **Resources:** authoring guide, annotated examples, value-pair catalog, preamble templates (`mcp/resources/`).
- **Rate limiting:** 120 req/min per API key (in `mcp/rate-limit.ts`).

---

## Python Workers (`workers/`)

| Package | Purpose |
|---------|---------|
| `anthropic`, `openai`, `google-generativeai`, plus HTTP-based adapters for xAI / DeepSeek / Mistral | Provider clients |
| `requests` | HTTP |
| `PyYAML` | definition I/O |
| `pytest` | tests in `workers/tests/` |

Adapters live in `workers/common/llm_adapters/`. Statistics helpers live in `workers/stats/`.

Workers expose a JSON-in/JSON-out protocol so the TypeScript orchestrator can spawn and parse them without sharing process state.

---

## Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| Vitest | 2.1 (api) / 1.x (web) | Unit + integration tests |
| `@testing-library/react` | 14.1 | Component testing |
| supertest | 6.3 | HTTP assertions |
| jsdom | 23 | DOM for web tests |
| pytest | 7+ | Python worker tests |
| `@vitest/coverage-v8` | — | Coverage |

Coverage targets (per `cloud/CLAUDE.md`): 80 % line, 75 % branch, 80 % function minimum.

---

## Development & Tooling

| Technology | Purpose |
|------------|---------|
| ESLint 8, Prettier 3 | Lint / format |
| `tsx` 4 | TypeScript execution for dev and scripts |
| `pino` 8 (via `@valuerank/shared`) | Structured logging |
| Docker Compose | Local Postgres (+ PgBouncer) |
| Railway | Production deployment (Postgres + API) |

---

## Type-Safe End-to-End

```
Prisma schema
   ▼  (prisma generate)
@valuerank/db client
   ▼  (Pothos plugin-prisma)
GraphQL schema
   ▼  (GraphQL Code Generator — web only)
Typed urql documents
   ▼
React components
```

This chain means a schema change surfaces as a TypeScript error in the API resolvers, the web codegen step, and the React call sites.

---

## Structured Logging

```typescript
import { createLogger } from '@valuerank/shared';
const log = createLogger('runs');
log.info({ runId, userId }, 'Run created');
log.error({ err, config }, 'Failed to create run');
```

Always object-then-message. Never `console.log`.

---

## Error Handling

```typescript
import { NotFoundError, ValidationError } from '@valuerank/shared';
throw new NotFoundError('Definition', id);
throw new ValidationError('Invalid dimensions', errors);
```

A global Express error middleware maps `AppError` subclasses to HTTP status + code.

---

## Configuration

### Ports

| Service | Port |
|---------|------|
| Web (Vite) | 3030 |
| API (Express + GraphQL + MCP) | 3031 |
| Postgres (Docker Compose) | 5433 |
| PgBouncer (Docker Compose) | 6432 |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | App Postgres URL (via PgBouncer, `?pgbouncer=true`) |
| `DIRECT_URL` | yes | Direct Postgres URL for Prisma Migrate |
| `JWT_SECRET` | yes | 32+ chars |
| `OPENAI_API_KEY` | for runs | OpenAI |
| `ANTHROPIC_API_KEY` | for runs | Anthropic |
| `GOOGLE_API_KEY` | for runs | Google AI |
| `XAI_API_KEY` | for runs | xAI |
| `DEEPSEEK_API_KEY` | for runs | DeepSeek |
| `MISTRAL_API_KEY` | for runs | Mistral |
| `PORT` | no | API port (default 3031) |
| `LOG_LEVEL` | no | pino level |

### Example local URLs

```bash
# App traffic (via PgBouncer)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:6432/valuerank?pgbouncer=true"

# Direct connection for migrations
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank"

# Test database (direct, no pooler)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

---

## Version Compatibility

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.0 | 20 LTS |
| npm | 10.0 | 10+ |
| PostgreSQL | 14 | 15 |
| Python | 3.10 | 3.11 |

---

## Related Documentation

- [Architecture Overview](./overview.md)
- [Data Model](./data-model.md)
- [Queue System](../backend/queue-system.md)
- [LLM Providers](../backend/llm-providers.md)
- [Project Constitution](../../cloud/CLAUDE.md) — coding standards, preflight gate
