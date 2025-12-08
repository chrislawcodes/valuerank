# Stage 17: Production Deployment

> **Feature Branch**: `feature/stage-17-production-deployment`
> **Created**: 2025-12-08
> **Status**: Draft
> **Input**: Deploy Cloud ValueRank to Railway with proper configuration, CI/CD, monitoring, and team access

---

## Overview

This stage deploys Cloud ValueRank to Railway, enabling team access to the production application without requiring local development setup. The deployment architecture includes:

1. **API Server** - Express GraphQL API with PgBoss queue
2. **Web Frontend** - React SPA served via Vite build
3. **PostgreSQL Database** - Managed Railway PostgreSQL with PgBoss tables
4. **Python Workers** - Spawned by TypeScript orchestrator for LLM calls and analysis

---

## User Scenarios & Testing

### User Story 1 - Access Production Application (Priority: P1)

A researcher wants to access Cloud ValueRank from their browser without setting up a local development environment.

**Why this priority**: This is the core value proposition of deployment - making the tool accessible to the team.

**Independent Test**: Navigate to production URL in browser, login with credentials, verify application loads and functions.

**Acceptance Scenarios**:

1. **Given** the application is deployed, **When** user navigates to the production URL, **Then** the login page loads within 3 seconds.

2. **Given** valid user credentials, **When** user logs in, **Then** they see the main dashboard and can navigate to Definitions/Runs/Settings.

3. **Given** HTTPS is configured, **When** user accesses the site, **Then** browser shows secure connection (valid SSL certificate).

---

### User Story 2 - Railway Project Setup (Priority: P1)

A developer needs to configure Railway to host all application services from the monorepo.

**Why this priority**: Without proper Railway configuration, no services can run.

**Independent Test**: Deploy each service to Railway, verify all services start and connect to each other.

**Acceptance Scenarios**:

1. **Given** Railway project is created, **When** API service is deployed with correct root directory (`cloud/apps/api`), **Then** service starts and health check passes.

2. **Given** Railway project is created, **When** Web service is deployed with correct root directory (`cloud/apps/web`), **Then** static assets are served and frontend loads.

3. **Given** Railway PostgreSQL provisioned, **When** API service starts, **Then** Prisma connects successfully and PgBoss initializes.

4. **Given** Python runtime configured, **When** probe job executes, **Then** Python worker spawns and returns results.

---

### User Story 3 - Automated Deployments via CI/CD (Priority: P1)

A developer pushes code to main branch and expects automatic deployment to production.

**Why this priority**: Manual deployments are error-prone and slow down iteration.

**Independent Test**: Push a commit to main, verify Railway triggers build and deploy automatically.

**Acceptance Scenarios**:

1. **Given** GitHub repository connected to Railway, **When** code is pushed to `main` branch, **Then** Railway triggers automatic deployment within 5 minutes.

2. **Given** CI tests are running in GitHub Actions, **When** tests pass, **Then** Railway deployment proceeds.

3. **Given** CI tests fail, **When** push is made, **Then** Railway deployment is blocked until tests pass.

4. **Given** deployment in progress, **When** checking Railway dashboard, **Then** build logs show progress and any errors.

---

### User Story 4 - Environment Variable Management (Priority: P1)

An admin needs to configure API keys and secrets for production without committing them to git.

**Why this priority**: Security requirement - secrets must never be in source control.

**Independent Test**: Set environment variables in Railway, verify services use correct values.

**Acceptance Scenarios**:

1. **Given** LLM API keys configured in Railway variables, **When** probe job runs, **Then** LLM calls succeed with configured provider.

2. **Given** JWT_SECRET configured in Railway, **When** user logs in, **Then** authentication works correctly.

3. **Given** DATABASE_URL provided by Railway PostgreSQL, **When** API starts, **Then** Prisma connects without manual configuration.

4. **Given** variable changed in Railway dashboard, **When** service restarts, **Then** new value is used.

---

### User Story 5 - Health Check Endpoints (Priority: P1)

Railway and monitoring systems need to verify application health.

**Why this priority**: Health checks are required for Railway zero-downtime deployments and alerting.

**Independent Test**: Call health endpoints, verify they return appropriate status codes and diagnostic info.

**Acceptance Scenarios**:

1. **Given** API is running, **When** GET `/health` is called, **Then** returns 200 with `{ status: "ok", timestamp: "..." }`.

2. **Given** database is connected, **When** health check runs, **Then** response includes `{ database: "connected" }`.

3. **Given** PgBoss is initialized, **When** health check runs, **Then** response includes `{ queue: "healthy" }`.

4. **Given** Python worker is available, **When** health check runs, **Then** response includes `{ worker: "available" }`.

5. **Given** database connection fails, **When** health check runs, **Then** returns 503 with diagnostic info.

---

### User Story 6 - Database Backups (Priority: P2)

An admin needs assurance that database data is backed up and recoverable.

**Why this priority**: Important for data protection but Railway provides some automation.

**Independent Test**: Verify Railway backup configuration, attempt restore to staging environment.

**Acceptance Scenarios**:

1. **Given** Railway PostgreSQL provisioned, **When** checking backup settings, **Then** automatic daily backups are enabled.

2. **Given** backups are running, **When** disaster occurs, **Then** can restore to point-in-time within last 7 days.

3. **Given** manual backup trigger, **When** admin requests backup, **Then** snapshot is created within 5 minutes.

---

### User Story 7 - Custom Domain & SSL (Priority: P2)

Team wants to access the application via a memorable domain with HTTPS.

**Why this priority**: Important for professionalism and security but system works on Railway subdomain.

**Independent Test**: Configure custom domain, verify DNS resolves and SSL certificate is valid.

**Acceptance Scenarios**:

1. **Given** custom domain configured in Railway, **When** DNS is set up, **Then** domain resolves to application within 24 hours.

2. **Given** domain is connected, **When** Railway provisions certificate, **Then** HTTPS works with valid Let's Encrypt certificate.

3. **Given** both API and Web need domains, **When** configured, **Then** API at `api.valuerank.ai` and Web at `app.valuerank.ai` (or similar).

---

### User Story 8 - Error Tracking (Priority: P3)

Developers want visibility into production errors without checking logs manually.

**Why this priority**: Nice-to-have for MVP; can use logs initially.

**Independent Test**: Trigger an error in production, verify it appears in error tracking dashboard.

**Acceptance Scenarios**:

1. **Given** Sentry (or similar) configured, **When** unhandled exception occurs, **Then** error is captured with stack trace and context.

2. **Given** error occurs, **When** checking Sentry dashboard, **Then** error shows source maps for readable stack traces.

3. **Given** same error occurs multiple times, **When** viewing in Sentry, **Then** errors are grouped and show frequency.

---

## Edge Cases

### Deployment
- **First deployment**: Database empty, need to run migrations and seed data
- **Zero-downtime deploy**: Railway handles rolling deploys; verify PgBoss handles job handoff
- **Failed deployment**: Railway auto-rollbacks; verify previous version remains accessible
- **Build timeout**: Large monorepo build may exceed default timeout; configure appropriately

### Environment
- **Missing env vars**: Service should fail fast with clear error message about missing configuration
- **Invalid API keys**: LLM provider errors should be logged but not crash the service
- **Database connection failure**: Service should retry with exponential backoff

### Python Workers
- **Python not available**: Health check should detect and report Python availability
- **Worker timeout**: Long-running LLM calls should have configurable timeout (default 5 minutes)
- **Worker crash**: TypeScript orchestrator should catch and report Python errors

### CI/CD
- **Flaky tests**: Consider retry mechanism for intermittent failures
- **Long build times**: Turborepo caching should reduce incremental build time
- **Parallel deploys**: Multiple pushes in quick succession should queue, not conflict

---

## Requirements

### Functional Requirements

#### Railway Configuration
- **FR-001**: System MUST deploy API service from `cloud/apps/api` root directory with Node.js runtime
- **FR-002**: System MUST deploy Web service from `cloud/apps/web` root directory as static site
- **FR-003**: System MUST configure PostgreSQL addon with PgBoss schema initialized
- **FR-004**: System MUST configure Python environment for worker script execution
- **FR-005**: Services MUST use watch paths to prevent unnecessary rebuilds (API: `apps/api/**`, `packages/**`; Web: `apps/web/**`, `packages/**`)

#### Environment Variables
- **FR-006**: System MUST support configuration via Railway environment variables for all secrets
- **FR-007**: Required variables MUST include: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`
- **FR-008**: LLM provider keys SHOULD be configurable: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc.
- **FR-009**: System MUST fail fast with descriptive error if required variables are missing

#### Health Checks
- **FR-010**: API MUST expose `GET /health` endpoint returning JSON with component status
- **FR-011**: Health check MUST verify database connectivity
- **FR-012**: Health check MUST verify PgBoss queue status
- **FR-013**: Health check SHOULD verify Python worker availability
- **FR-014**: Health check MUST return 503 if any critical component is unhealthy

#### CI/CD Pipeline
- **FR-015**: GitHub Actions MUST run tests on pull requests and main branch pushes
- **FR-016**: Railway deployment MUST trigger automatically on main branch push
- **FR-017**: Railway SHOULD wait for CI tests to pass before deploying (optional setting)
- **FR-018**: CI pipeline MUST run: lint, typecheck, test (all packages)

#### Database Management
- **FR-019**: Prisma migrations MUST run automatically on deploy via release command
- **FR-020**: Railway MUST configure automatic daily database backups
- **FR-021**: System SHOULD support manual backup trigger from Railway dashboard

---

## Success Criteria

- **SC-001**: Application accessible via HTTPS URL with valid SSL certificate
- **SC-002**: Login and core functionality (view definitions, start runs) works in production
- **SC-003**: Automatic deployment completes within 10 minutes of push to main
- **SC-004**: Health check endpoint returns 200 when all components healthy
- **SC-005**: LLM probe jobs execute successfully in production environment
- **SC-006**: Database backups occur daily without manual intervention
- **SC-007**: Zero unplanned downtime during initial deployment

---

## Key Entities

### Railway Services (New Configuration)

| Service | Root Directory | Build Command | Start Command | Runtime |
|---------|----------------|---------------|---------------|---------|
| api | `cloud/apps/api` | `npm run build` | `npm run start` | Node.js 20 |
| web | `cloud/apps/web` | `npm run build` | (static serve) | Static |
| worker | `cloud/workers` | (none) | (spawned by API) | Python 3.11 |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Railway-provided PostgreSQL URL |
| `JWT_SECRET` | Yes | 32+ character secret for JWT signing |
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | Railway-provided port |
| `OPENAI_API_KEY` | No | OpenAI API key for LLM calls |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for LLM calls |
| `GOOGLE_API_KEY` | No | Google AI API key for LLM calls |
| `XAI_API_KEY` | No | xAI API key for LLM calls |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key for LLM calls |
| `MISTRAL_API_KEY` | No | Mistral API key for LLM calls |

### GitHub Actions Workflow (New File)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
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

## Assumptions

1. **Railway account exists**: Team has Railway account with appropriate billing plan
2. **GitHub repository accessible**: Repository can be connected to Railway
3. **Domain optional**: System works on Railway-provided subdomain initially
4. **Single environment**: Production only for MVP; staging can be added later
5. **Manual migration for first deploy**: First deploy requires manual `prisma db push`
6. **Python bundled with Node**: Railway nixpacks can include both Node.js and Python

---

## Out of Scope

- **Staging environment**: Single production environment for MVP
- **Blue-green deployments**: Railway's standard rolling deploy is sufficient
- **Custom monitoring dashboards**: Use Railway built-in metrics
- **Auto-scaling**: Fixed resources for MVP
- **Multi-region deployment**: Single region sufficient for internal tool
- **CDN for static assets**: Railway's built-in serving is sufficient

---

## Constitution Compliance

**Validated against cloud/CLAUDE.md**:

| Requirement | Compliance |
|-------------|------------|
| File size < 400 lines | Configuration files are small and focused |
| No `any` types | No new TypeScript code required |
| Test coverage 80%+ | CI enforces existing coverage requirements |
| Structured logging | Existing logging works in production |
| Error handling | Health check reports errors appropriately |

---

## GitHub Permissions Investigation

**Critical Finding for Repository Access:**

Based on [Railway documentation](https://docs.railway.com/guides/github-autodeploys) and [Railway Help Station](https://station.railway.com/questions/deploying-user-s-private-git-hub-reposit-24ee7832):

### If Repository is in a GitHub Organization (you're not owner):

1. **Organization owner must authorize Railway GitHub App**
   - Go to GitHub → Settings → Applications → Authorized OAuth Apps
   - Railway app must be granted access to the organization

2. **Repository-level access**
   - The organization owner needs to grant Railway access to the specific repository
   - This is done via GitHub → Settings → Integrations → Configure Railway app

3. **Your required actions**:
   - Install Railway GitHub App on your personal account
   - Connect your Railway account to GitHub
   - Request that the repository owner/org admin authorize Railway for the repo

### If Repository is Personal (you own it):

1. Simply connect Railway to GitHub and grant access to the repository
2. No additional permissions needed

### Alternative Approaches if Org Permissions Blocked:

1. **Fork to personal account**: Deploy from personal fork, sync changes manually
2. **Manual deployments**: Use Railway CLI to deploy without GitHub integration
3. **Docker-based deploy**: Build Docker images in CI, push to registry, deploy to Railway

---

## Decision: Fork-Based Deployment

**Decision**: Deploy from a personal fork of the repository.

**Context**: The original repository (`chrislawcodes/valuerank`) is owned by a friend's account. Rather than requiring them to authorize Railway, the deployment will use a personal fork.

**Approach** (Revised Workflow):
1. Complete all deployment configuration on `cloud-planning` branch (health endpoint, CI, Railway config)
2. Merge `cloud-planning` → `main` on original repo (`chrislawcodes/valuerank`)
3. Fork `chrislawcodes/valuerank` to personal GitHub account (main now has everything)
4. Connect Railway to the personal fork (full ownership = direct authorization)
5. Deploy from personal fork to Railway

**Why this order**:
- Deployment config (health checks, CI workflow) must exist before Railway can auto-deploy
- Merging to main first means the fork starts with a deployable state
- Avoids needing to sync changes between repos after forking

**Implications**:
- Full control over Railway integration
- Fork's `main` is immediately deployable
- Can pull future updates from upstream (`chrislawcodes/valuerank`)
- CI/CD triggers on pushes to personal fork's `main` branch

---

## Related Documents

- `cloud/docs/deployment.md` - Deployment architecture overview
- `cloud/docs/architecture-overview.md` - System architecture
- `cloud/docker-compose.yml` - Local development setup (reference for production)
- `cloud/apps/api/package.json` - API build/start scripts
- `cloud/apps/web/package.json` - Web build/start scripts

Sources:
- [Railway Monorepo Deployment Docs](https://docs.railway.com/guides/monorepo)
- [Railway GitHub Autodeploys](https://docs.railway.com/guides/github-autodeploys)
- [Railway Help - Private Repos](https://station.railway.com/questions/deploying-user-s-private-git-hub-reposit-24ee7832)
