# Tech Stack

> Technologies used in Cloud ValueRank and the rationale for each choice

---

## Overview

Cloud ValueRank is built as a TypeScript-first monorepo with Python workers for LLM operations. The stack prioritizes:

- **Developer experience** - Hot reload, type safety, familiar tools
- **Operational simplicity** - Single database, minimal infrastructure
- **Token efficiency** - GraphQL for flexible queries, structured responses
- **CLI compatibility** - Python workers can share adapters with the CLI pipeline

---

## Core Technologies

### Runtime & Package Management

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20+ | JavaScript runtime |
| **npm** | 10.2 | Package manager |
| **Turborepo** | 2.3 | Monorepo build orchestration |
| **TypeScript** | 5.3 | Type-safe JavaScript |
| **Python** | 3.10+ | Worker scripts for LLM operations |

**Rationale:**
- Node.js 20 LTS provides stable ES module support
- Turborepo enables cached builds across packages
- TypeScript catches errors at compile time
- Python workers reuse LLM adapters from the CLI pipeline

---

### API Server

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express** | 4.18 | HTTP server framework |
| **GraphQL Yoga** | 5.1 | GraphQL server |
| **Pothos** | 3.41 | Schema builder (type-safe) |
| **DataLoader** | 2.2 | N+1 query prevention |
| **Zod** | 3.22 | Input validation |

**Rationale:**

**Express over Fastify:**
- Mature ecosystem, extensive middleware
- Team familiarity
- No need for Fastify's extra performance

**GraphQL over REST:**
- LLMs can introspect schema and construct precise queries
- Single endpoint simplifies MCP integration
- Flexible data fetching critical for token budgets
- Nested relationships in single query

**Pothos over SDL-first:**
- Type-safe schema definition
- Better IDE support
- No schema drift

```typescript
// Example: Type-safe schema with Pothos
const Definition = builder.prismaObject('Definition', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    content: t.field({
      type: 'JSON',
      resolve: (def) => def.content,
    }),
  }),
});
```

---

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| **PostgreSQL** | 15+ | Primary database |
| **Prisma** | 5.7 | ORM and query builder |
| **PgBoss** | 12.5 | Job queue (PostgreSQL-backed) |

**Rationale:**

**PostgreSQL over MongoDB:**
- Definition versioning requires DAG queries (ancestry, descendants)
- Recursive CTEs handle version trees efficiently
- JSONB provides schema flexibility without migrations
- Single database for both app data and job queue

**PgBoss over BullMQ/Redis:**
- Uses same PostgreSQL - no additional infrastructure
- Built-in retry, scheduling, priority queues
- Transactional with application data
- Simpler operational model

**Prisma over raw SQL:**
- Type-safe queries
- Migration management
- Generated TypeScript types

---

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.2 | UI framework |
| **Vite** | 5.0 | Build tool and dev server |
| **TypeScript** | 5.3 | Type safety |
| **Tailwind CSS** | 3.3 | Utility-first styling |
| **urql** | 4.0 | GraphQL client |
| **React Router** | 6.21 | Client-side routing |
| **Monaco Editor** | 4.7 | Code/definition editing |
| **Recharts** | 3.5 | Data visualization |
| **Lucide** | 0.294 | Icons |

**Rationale:**

**React over alternatives:**
- Team familiarity
- Component reuse from DevTool
- Extensive ecosystem

**Vite over CRA/Webpack:**
- Fast hot reload
- Modern ES module handling
- Simpler configuration

**urql over Apollo:**
- Lighter weight
- Simpler caching model
- Good TypeScript support

**Tailwind over CSS-in-JS:**
- Consistent design system
- No runtime overhead
- Easy responsive design

---

### Authentication

| Technology | Version | Purpose |
|------------|---------|---------|
| **bcrypt** | 5.1 | Password hashing |
| **jsonwebtoken** | 9.0 | JWT creation/verification |
| **express-rate-limit** | 7.1 | Request rate limiting |

**Rationale:**
- JWT for stateless authentication
- bcrypt for secure password storage
- Rate limiting protects against abuse

---

### MCP Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| **@modelcontextprotocol/sdk** | 1.24 | MCP server implementation |

**Rationale:**
- Official MCP SDK for protocol compliance
- Stdio transport for local LLM integration
- Enables AI agents to query and author data

---

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vitest** | 2.1 | Test runner |
| **@testing-library/react** | 14.1 | React component testing |
| **supertest** | 6.3 | HTTP assertion library |
| **pytest** | 7+ | Python test runner |

**Rationale:**
- Vitest is fast and Vite-native
- Testing Library encourages user-centric tests
- supertest enables API integration tests

---

### Development Tools

| Technology | Version | Purpose |
|------------|---------|---------|
| **ESLint** | 8.56 | Linting |
| **Prettier** | 3.2 | Code formatting |
| **tsx** | 4.6 | TypeScript execution |
| **pino** | 8+ | Structured logging |

---

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker Compose** | Local development |
| **Railway** | Production deployment |

**Railway over other platforms:**
- Simple deployment model
- Good developer experience
- PostgreSQL included
- No container management needed

---

## Package Dependencies by App

### API (`@valuerank/api`)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.24.3",
    "@pothos/core": "^3.41.0",
    "@pothos/plugin-prisma": "^3.65.0",
    "@pothos/plugin-validation": "^3.10.1",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dataloader": "^2.2.2",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "graphql": "^16.8.1",
    "graphql-yoga": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "pg-boss": "^12.5.2",
    "yaml": "^2.8.2",
    "zod": "^3.22.4"
  }
}
```

### Web (`@valuerank/web`)

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.7.0",
    "@urql/exchange-auth": "^2.1.6",
    "graphql": "^16.8.0",
    "lucide-react": "^0.294.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "recharts": "^3.5.1",
    "urql": "^4.0.0"
  }
}
```

### Database (`@valuerank/db`)

```json
{
  "dependencies": {
    "@prisma/client": "^5.7.0"
  }
}
```

### Python Workers

```
# workers/requirements.txt
requests>=2.31.0
PyYAML>=6.0
anthropic>=0.25.0
openai>=1.12.0
google-generativeai>=0.4.0
```

---

## Architectural Patterns

### Type-Safe End-to-End

The stack enables type safety from database to UI:

```
Prisma Schema → Generated Types → Pothos Schema → GraphQL → urql Codegen → React
```

### Structured Logging

All logging uses pino for structured JSON output:

```typescript
import { createLogger } from '@valuerank/shared';
const log = createLogger('service-name');

log.info({ userId, action: 'login' }, 'User logged in');
```

### Error Handling

Custom error classes with codes and status:

```typescript
import { NotFoundError, ValidationError } from '@valuerank/shared';

throw new NotFoundError('Definition', id);
throw new ValidationError('Invalid dimensions', errors);
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (32+ chars) |
| `OPENAI_API_KEY` | For runs | OpenAI API key |
| `ANTHROPIC_API_KEY` | For runs | Anthropic API key |
| `GOOGLE_API_KEY` | For runs | Google AI API key |
| `XAI_API_KEY` | For runs | xAI API key |
| `DEEPSEEK_API_KEY` | For runs | DeepSeek API key |
| `MISTRAL_API_KEY` | For runs | Mistral API key |
| `PORT` | No | API server port (default: 3001) |
| `LOG_LEVEL` | No | Logging level (default: info) |

### Database Connection

Development and test databases run on port 5433:

```bash
# Development
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank"

# Test
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

---

## Version Compatibility

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.0 | 20 LTS |
| npm | 10.0 | 10.2 |
| PostgreSQL | 14 | 15 |
| Python | 3.10 | 3.11 |

---

## Related Documentation

- [Architecture Overview](./overview.md) - System components
- [Data Model](./data-model.md) - Database schema
- [Local Development](../operations/local-development.md) - Setup guide
- [Project Constitution](../../CLAUDE.md) - Coding standards
