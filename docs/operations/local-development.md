# Local Development

> **Part of [Cloud ValueRank Documentation](../README.md)**

This guide covers setting up and running Cloud ValueRank locally for development.

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20+ | Runtime for API and build tools |
| npm | 10+ | Package management |
| Docker | Latest | PostgreSQL container |
| Python | 3.11+ | Worker scripts |
| Git | Latest | Version control |

### LLM API Keys (Optional for Development)

To run probe jobs that call LLM providers, you'll need API keys. For basic UI development, these aren't required.

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google AI | `GOOGLE_API_KEY` |
| xAI | `XAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/valuerank.git
cd valuerank/cloud

# 2. Start PostgreSQL
docker-compose up -d

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env to set JWT_SECRET (min 32 chars)

# 5. Initialize database
npm run db:push

# 6. Seed development data
npm run db:seed

# 7. Start development servers
npm run dev
```

After these steps:
- **API**: http://localhost:3031/graphql (GraphQL Playground)
- **Web**: http://localhost:3030 (React frontend)

---

## Project Structure

```
cloud/
├── apps/
│   ├── api/              # Express + GraphQL API server
│   │   ├── src/
│   │   │   ├── graphql/  # Types, queries, mutations
│   │   │   ├── queue/    # PgBoss job handlers
│   │   │   ├── auth/     # JWT authentication
│   │   │   └── mcp/      # MCP server tools
│   │   └── tests/        # API tests
│   └── web/              # React frontend (Vite)
│       ├── src/
│       │   ├── pages/    # Route pages
│       │   ├── components/
│       │   └── hooks/
│       └── tests/
├── packages/
│   ├── db/               # Prisma schema, database client
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── seed.ts
│   └── shared/           # Logger, errors, env utilities
├── workers/              # Python worker scripts
│   ├── probe.py
│   ├── analyze_basic.py
│   ├── summarize.py
│   └── health_check.py
├── docker-compose.yml    # Local PostgreSQL
├── turbo.json           # Turborepo configuration
├── package.json         # Workspace root
└── .env.example         # Environment template
```

---

## Database Setup

### PostgreSQL Container

Cloud ValueRank uses PostgreSQL running in Docker on port **5433** (not the default 5432).

```bash
# Start PostgreSQL
docker-compose up -d

# Verify it's running
docker ps | grep valuerank-postgres

# View logs
docker logs valuerank-postgres
```

**Connection Details:**

| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5433 |
| User | valuerank |
| Password | valuerank |
| Database (dev) | valuerank |
| Database (test) | valuerank_test |

The test database is automatically created by `docker/init-test-db.sql` when the container starts.

### Database URLs

```bash
# Development
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank"

# Test
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

### Prisma Commands

```bash
# Push schema changes to database (development)
npm run db:push

# Open Prisma Studio (GUI database browser)
npm run db:studio

# Generate Prisma client after schema changes
npm run db:generate

# Run migrations (for production schema changes)
npm run db:migrate

# Seed development data
npm run db:seed
```

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Database (default works with docker-compose)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank"

# API server
PORT=3031
NODE_ENV=development
LOG_LEVEL=debug

# Authentication - REQUIRED
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-secure-random-secret-here-minimum-32-chars

# LLM Providers (optional - only needed for probe jobs)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Development Scripts

### Workspace Root (`cloud/`)

```bash
# Start all apps in development mode
npm run dev

# Build all packages
npm run build

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint all packages
npm run lint

# Fix lint issues
npm run lint:fix

# Type check all packages
npm run typecheck

# Clean build artifacts
npm run clean
```

### API (`cloud/apps/api/`)

```bash
# Start API in dev mode (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run API tests
npm test

# Create a new user via CLI
npm run create-user
```

### Web (`cloud/apps/web/`)

```bash
# Start frontend in dev mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Database (`cloud/packages/db/`)

```bash
# Generate Prisma client
npm run generate

# Push schema to database
npm run push

# Open Prisma Studio
npm run studio
```

---

## Turborepo

The project uses [Turborepo](https://turbo.build/) for monorepo management. Key benefits:

- **Cached builds**: Unchanged packages aren't rebuilt
- **Parallel execution**: Independent tasks run concurrently
- **Dependency ordering**: Packages build in correct order

### Configuration (`turbo.json`)

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build", "^test"],
      "outputs": ["coverage/**"]
    }
  }
}
```

### Running Specific Packages

```bash
# Run command in specific workspace
npm run build --workspace=@valuerank/api
npm test --workspace=@valuerank/db

# Filter by package name
npx turbo run test --filter=@valuerank/api
```

---

## Test User Account

The seed script creates a development user:

| Field | Value |
|-------|-------|
| Email | dev@valuerank.ai |
| Password | development |

To seed (or re-seed) the development database:

```bash
npm run db:seed
```

---

## Common Development Tasks

### Adding a New GraphQL Field

1. Update Prisma schema if needed (`packages/db/prisma/schema.prisma`)
2. Run `npm run db:push` and `npm run db:generate`
3. Add type field in `apps/api/src/graphql/types/`
4. Add resolver in queries or mutations as needed
5. Test via GraphQL Playground at http://localhost:3031/graphql

### Adding a New API Endpoint

1. Create route file in `apps/api/src/routes/`
2. Register in `apps/api/src/index.ts`
3. Add corresponding tests in `apps/api/tests/`

### Adding a New React Page

1. Create page component in `apps/web/src/pages/`
2. Add route in `apps/web/src/App.tsx`
3. Add navigation link if needed

### Modifying Python Workers

1. Edit worker in `workers/`
2. Test locally: `python workers/health_check.py`
3. Workers are spawned by the TypeScript orchestrator in `apps/api/src/queue/handlers/`

---

## Troubleshooting

### Port Conflicts

If you see "port already in use" errors:

```bash
# Find what's using the port
lsof -i :3031  # API
lsof -i :3030  # Web
lsof -i :5433  # PostgreSQL

# Kill the process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep valuerank-postgres

# Restart the container
docker-compose down && docker-compose up -d

# Check container logs
docker logs valuerank-postgres
```

### Prisma Schema Out of Sync

```bash
# Push schema changes (dev only)
npm run db:push

# Regenerate client
npm run db:generate

# If all else fails, reset the database
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma db push --schema=packages/db/prisma/schema.prisma --force-reset
```

### Build Failures

```bash
# Clean everything and reinstall
npm run clean
rm -rf node_modules
npm install
npm run build
```

---

## Related Documentation

- [Deployment Guide](./deployment.md) - Railway production deployment
- [Testing Guide](./testing.md) - Test structure and coverage
- [Architecture Overview](../architecture/overview.md) - System design
- [CLAUDE.md](../../CLAUDE.md) - Coding standards and constitution
