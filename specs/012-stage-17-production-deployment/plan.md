# Implementation Plan: Stage 17 - Production Deployment

**Branch**: `feature/stage-17-production-deployment` | **Date**: 2025-12-08 | **Spec**: [spec.md](./spec.md)

## Summary

Deploy Cloud ValueRank to Railway using a fork-based approach, with GitHub Actions CI/CD, automatic deployments on push to main, and proper health checks for zero-downtime deployments.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (API/Web), Python 3.11+ (Workers)
**Primary Dependencies**: Express, GraphQL Yoga, Prisma, PgBoss, Vite, React
**Storage**: Railway PostgreSQL (managed)
**Testing**: vitest (TypeScript), pytest (Python)
**Target Platform**: Railway (PaaS)
**Build System**: Turborepo monorepo
**Performance Goals**: Login page loads < 3s, health checks respond < 500ms
**Constraints**: Fork-based deployment, monorepo structure

---

## Constitution Check

**Status**: PASS

Per `cloud/CLAUDE.md`:

### File Size Limits
- [x] Configuration files (railway.toml, .github/workflows/) will be under 400 lines
- [x] Health check endpoint code fits in existing route handlers

### TypeScript Standards
- [x] No new `any` types - configuration is JSON/YAML
- [x] Health check types are well-defined

### Testing Requirements
- [x] CI pipeline enforces 80% coverage minimum
- [x] Health checks are testable

### Logging Standards
- [x] Existing structured logging works in production
- [x] Health check includes diagnostic info

---

## Architecture Decisions

### Decision 1: Railway Service Architecture

**Chosen**: Three Railway services from single monorepo

```
┌─────────────────────────────────────────────────────────────┐
│                     Railway Project                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │     API      │  │     Web      │  │    PostgreSQL    │  │
│  │  (Node.js)   │  │   (Static)   │  │    (Managed)     │  │
│  │              │  │              │  │                  │  │
│  │ Root: cloud/ │  │ Root: cloud/ │  │ Auto-provisioned │  │
│  │   apps/api   │  │   apps/web   │  │ + PgBoss schema  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                                    │              │
│         └────────────DATABASE_URL────────────┘              │
│                                                             │
│  Python workers spawn from API service (not separate svc)   │
└─────────────────────────────────────────────────────────────┘
```

**Rationale**:
- API and Web need separate deployments (different runtimes/builds)
- Python workers spawn from TypeScript orchestrator (no separate service needed)
- Railway auto-provisions DATABASE_URL

**Alternatives Considered**:
- Separate worker service: Rejected - adds complexity, workers are stateless scripts
- Single service: Rejected - Web is static, API is dynamic

**Tradeoffs**:
- Pros: Clean separation, Railway handles routing, simpler config
- Cons: Two deployments to manage, must coordinate release

---

### Decision 2: CI/CD Strategy

**Chosen**: GitHub Actions for CI, Railway for CD

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PR Created  │────▶│ GitHub       │────▶│ Tests Pass?  │
│              │     │ Actions CI   │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                           Yes   │   No
                                           ┌─────┴─────┐
                                           │           │
                                           ▼           ▼
                                    ┌──────────┐  ┌──────────┐
                                    │ Merge OK │  │ PR Fails │
                                    └────┬─────┘  └──────────┘
                                         │
                                         ▼
                            ┌────────────────────────┐
                            │  Push to main branch   │
                            └───────────┬────────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │  Railway auto-deploys  │
                            │  (triggered by webhook)│
                            └────────────────────────┘
```

**Rationale**:
- GitHub Actions has free tier for private repos
- Railway GitHub integration handles deploys automatically
- Tests run before merge prevents bad code reaching production

**Alternatives Considered**:
- Railway-only CI: Limited, no test runner
- CircleCI/Jenkins: Overkill for this scale

**Tradeoffs**:
- Pros: Standard tooling, automatic, well-documented
- Cons: Two systems (GitHub + Railway), slight delay between merge and deploy

---

### Decision 3: Database Migration Strategy

**Chosen**: Prisma release command in Railway

**Approach**:
```yaml
# In railway.toml for API service
[deploy]
releaseCommand = "npx prisma migrate deploy"
```

**Rationale**:
- Railway release command runs BEFORE new version goes live
- If migration fails, deployment fails (safe)
- Prisma migrate deploy is idempotent

**Alternatives Considered**:
- Manual migration: Error-prone, breaks automation
- Start command migration: Risky if multiple instances start

**Tradeoffs**:
- Pros: Automated, safe, atomic with deploy
- Cons: Must test migrations locally first

---

### Decision 4: Health Check Implementation

**Chosen**: Comprehensive `/health` endpoint with component status

```typescript
// Response structure
{
  status: "ok" | "degraded" | "unhealthy",
  timestamp: "2025-12-08T...",
  version: "1.0.0",
  components: {
    database: { status: "connected", latency: 5 },
    queue: { status: "healthy", pending: 0, active: 0 },
    worker: { status: "available" }
  }
}
```

**Rationale**:
- Railway needs health endpoint for zero-downtime deploys
- Component status helps diagnose production issues
- Version field aids debugging deployments

**Alternatives Considered**:
- Simple 200 response: Not enough info for diagnostics
- Separate endpoint per component: Complicates monitoring

---

### Decision 5: Python Worker Deployment

**Chosen**: Python bundled in API service via nixpacks

**Approach**:
- Railway nixpacks detects both Node.js and Python
- Configure `NIXPACKS_PYTHON_VERSION=3.11`
- Worker scripts at `cloud/workers/` accessible from API
- TypeScript spawns `python3 workers/probe.py` etc.

**Rationale**:
- Keeps worker deployment tied to API (they must stay in sync)
- No separate service to manage
- Nixpacks handles multi-runtime automatically

**Alternatives Considered**:
- Separate Python service: Complexity, need IPC
- Docker custom image: More control but more maintenance

**Tradeoffs**:
- Pros: Simple, automatic, synced with API
- Cons: Larger image size, depends on nixpacks behavior

---

## Project Structure

### New Files to Create

```
cloud/
├── .github/
│   └── workflows/
│       └── ci.yml                    # NEW: GitHub Actions workflow
├── apps/
│   └── api/
│       └── src/
│           └── routes/
│               └── health.ts         # NEW: Health check endpoint
├── railway.toml                      # NEW: Railway config (root)
└── nixpacks.toml                     # NEW: Multi-runtime config
```

### Files to Modify

```
cloud/
├── apps/api/src/
│   └── index.ts                      # ADD: Mount health route
└── package.json                      # ADD: Build scripts for Railway
```

### Service Configuration

| Service | Root Directory | Build Command | Start Command |
|---------|---------------|---------------|---------------|
| api | `cloud` | `npm run build --workspace=@valuerank/api` | `npm run start --workspace=@valuerank/api` |
| web | `cloud` | `npm run build --workspace=@valuerank/web` | (static) |

---

## Environment Variables

### Required for Production

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Railway (auto) | PostgreSQL connection string |
| `PORT` | Railway (auto) | Port to bind |
| `NODE_ENV` | Manual | Set to `production` |
| `JWT_SECRET` | Manual | 32+ char secret for auth |

### Optional LLM Provider Keys

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API access |
| `ANTHROPIC_API_KEY` | Anthropic API access |
| `GOOGLE_API_KEY` | Google AI API access |
| `XAI_API_KEY` | xAI API access |
| `DEEPSEEK_API_KEY` | DeepSeek API access |
| `MISTRAL_API_KEY` | Mistral API access |

---

## Deployment Sequence

### Pre-Fork: Infrastructure Code (On cloud-planning branch)

Complete these on `cloud-planning` before forking:

1. **Create health endpoint** (`/health` with component status)
2. **Create GitHub Actions CI** (`.github/workflows/ci.yml`)
3. **Create Railway config** (`railway.toml`, `nixpacks.toml`)
4. **Update build scripts** in `package.json`
5. **Test CI passes** on PR
6. **Merge cloud-planning → main** on `chrislawcodes/valuerank`

### Initial Deployment (One-Time)

7. **Fork repository** to personal GitHub account (main now has deployment config)
8. **Create Railway project** with PostgreSQL addon
9. **Connect Railway to forked GitHub repo**
10. **Configure environment variables** in Railway dashboard
11. **Deploy API service** with correct root directory
12. **Run initial migration** via Railway release command
13. **Seed initial user** via Railway shell
14. **Deploy Web service** with correct root directory
15. **Configure custom domain** (optional)
16. **Verify health checks** pass

### Ongoing Deployments (Automatic)

1. Developer pushes to `main` on fork
2. GitHub Actions runs CI (lint, typecheck, test)
3. If CI passes, Railway auto-deploys
4. Railway runs release command (migrations)
5. Railway starts new version
6. Health check passes → traffic shifts
7. Old version terminated

### Syncing Updates from Upstream

```bash
# In your fork's local clone
git fetch upstream
git checkout main
git merge upstream/main
git push origin main  # Triggers Railway deploy
```

---

## Watch Paths (Prevent Unnecessary Rebuilds)

```toml
# API service watch paths
[build]
watchPaths = [
  "apps/api/**",
  "packages/db/**",
  "packages/shared/**",
  "workers/**",
  "package.json",
  "package-lock.json"
]

# Web service watch paths
[build]
watchPaths = [
  "apps/web/**",
  "packages/shared/**",
  "package.json",
  "package-lock.json"
]
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Database migration failure | Test migrations locally, Railway rollback |
| Bad deploy reaches production | CI gates, health checks block bad deploys |
| Secrets exposed | Railway encrypted variables, never in git |
| Python not available | Health check verifies worker availability |
| Fork gets out of sync | Document upstream sync process |

---

## Related Documents

- [spec.md](./spec.md) - Feature specification
- [cloud/docs/deployment.md](../../docs/deployment.md) - Architecture overview
- [cloud/CLAUDE.md](../../CLAUDE.md) - Project constitution
