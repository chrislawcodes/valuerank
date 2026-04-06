# Production Deployment

> **Part of [Cloud ValueRank Documentation](../README.md)**

Cloud ValueRank is deployed to [Railway](https://railway.app), a platform that simplifies deploying applications from GitHub repositories.

---

## Architecture Overview

The production deployment consists of four components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Railway Project                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │     Web      │   │     API      │   │    PostgreSQL    │   │
│  │   (Static)   │   │  (Node.js)   │   │    (Managed)     │   │
│  │              │   │              │   │                  │   │
│  │  React SPA   │──▶│  Express +   │──▶│  App Data +      │   │
│  │  Vite Build  │   │  GraphQL     │   │  PgBoss Queue    │   │
│  │              │   │              │   │                  │   │
│  └──────────────┘   └──────┬───────┘   └──────────────────┘   │
│                            │                                    │
│                            │ spawns                             │
│                            ▼                                    │
│                    ┌──────────────┐                            │
│                    │   Python     │                            │
│                    │   Workers    │                            │
│                    │              │                            │
│                    │  probe.py    │                            │
│                    │  analyze.py  │                            │
│                    │  summarize.py│                            │
│                    └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Railway Services

### Service Configuration

| Service | Root Directory | Build Command | Start Command | Runtime |
|---------|----------------|---------------|---------------|---------|
| **api** | `cloud/apps/api` | `npm run build` | `npm run start` | Node.js 20 |
| **web** | `cloud/apps/web` | `npm run build` | (static serve) | Static |
| **postgres** | - | - | - | PostgreSQL 16 |

**Python Workers**: Run within the API service. Railway's nixpacks detects both Node.js and Python requirements, bundling both runtimes.

### Watch Paths

To prevent unnecessary rebuilds when unrelated code changes:

- **API**: `cloud/apps/api/**`, `cloud/packages/**`
- **Web**: `cloud/apps/web/**`, `cloud/packages/**`

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Railway PostgreSQL URL | `postgresql://...` (auto-provided) |
| `JWT_SECRET` | JWT signing secret (32+ chars) | Generated secure string |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | Auto-provided by Railway |

### LLM Provider Keys

Configure at least one to enable probe jobs:

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GOOGLE_API_KEY` | Google AI |
| `XAI_API_KEY` | xAI (Grok) |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `MISTRAL_API_KEY` | Mistral |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity (debug, info, warn, error) |
| `PGBOSS_MAINTENANCE_INTERVAL` | `30` | Queue maintenance interval (seconds) |
| `QUEUE_WORKER_CONCURRENCY` | `5` | Concurrent jobs per type |

---

## Initial Deployment

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init
```

### 2. Add PostgreSQL

In Railway dashboard:
1. Click "New Service"
2. Select "Database" → "PostgreSQL"
3. Railway automatically provisions and provides `DATABASE_URL`

### 3. Deploy API Service

```bash
# Link to project
railway link

# Deploy API
railway up --service api
```

Or configure in Railway dashboard:
- Source: GitHub repository
- Root directory: `cloud/apps/api`
- Build command: `npm run build`
- Start command: `npm run start`

### 4. Deploy Web Service

Configure in Railway dashboard:
- Source: GitHub repository
- Root directory: `cloud/apps/web`
- Build command: `npm run build`
- Output directory: `dist`

### 5. Configure Environment Variables

In Railway dashboard → Service → Variables:

```
JWT_SECRET=<generate-secure-secret>
NODE_ENV=production
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 6. Initialize Database

After first deployment:

```bash
# SSH into API service
railway shell --service api

# Push schema
npx prisma db push --schema=packages/db/prisma/schema.prisma

# Seed data (LLM providers and models)
npx tsx packages/db/prisma/seed.ts
```

---

## Continuous Deployment

### GitHub Integration

Railway automatically deploys when code is pushed to the configured branch (typically `main`):

1. Connect GitHub repository in Railway dashboard
2. Select branch to deploy from
3. Pushes to that branch trigger automatic builds

### Deployment Flow

```
Push to main → Railway detects changes → Build → Deploy → Health check
```

### Watch Paths

Configure watch paths to only rebuild services when relevant files change:

- API service watches: `cloud/apps/api/**`, `cloud/packages/**`
- Web service watches: `cloud/apps/web/**`, `cloud/packages/**`

---

## Health Checks

The API exposes health endpoints for monitoring:

### Endpoint: `GET /health`

```json
{
  "status": "ok",
  "timestamp": "2025-12-09T10:30:00.000Z",
  "database": "connected",
  "queue": "healthy"
}
```

### Unhealthy Response (503)

```json
{
  "status": "unhealthy",
  "timestamp": "2025-12-09T10:30:00.000Z",
  "database": "disconnected",
  "error": "Connection refused"
}
```

Railway uses this endpoint for:
- Zero-downtime deployments (waits for health check before routing traffic)
- Service restarts if health check fails repeatedly

---

## Database Management

### Automatic Backups

Railway PostgreSQL provides automatic daily backups with:
- 7-day retention
- Point-in-time recovery

### Manual Backups

Create manual backup snapshots via Railway dashboard.

### Migrations

For schema changes in production:

```bash
# Generate migration
npx prisma migrate dev --name describe_change

# Apply to production
railway shell --service api
npx prisma migrate deploy
```

---

## Monitoring & Logs

### View Logs

```bash
# API service logs
railway logs --service api --lines 100

# Real-time logs
railway logs --service api --follow

# Web service logs
railway logs --service web --lines 100

# PostgreSQL logs
railway logs --service postgres --lines 100
```

### SSH Access

```bash
# API container
railway shell --service api

# Once inside, you can:
# - Run Prisma commands
# - Check Python availability
# - Debug issues
```

### Metrics

Railway dashboard provides:
- CPU usage
- Memory usage
- Network traffic
- Request counts

---

## Scaling

### Current Configuration (MVP)

- **API**: Single instance
- **Web**: Static hosting (scales automatically)
- **Database**: Railway managed PostgreSQL

### Future Scaling Options

1. **Horizontal scaling**: Multiple API instances with shared queue
2. **Database**: Upgrade to larger plan, add read replicas
3. **Workers**: Separate worker service for heavy LLM processing

---

## Rollback

### Automatic Rollback

Railway automatically rolls back if:
- Build fails
- Health check fails after deployment

### Manual Rollback

In Railway dashboard:
1. Go to service → Deployments
2. Find previous successful deployment
3. Click "Rollback"

---

## Custom Domains

### Configuration

1. In Railway dashboard → Service → Settings → Domains
2. Add custom domain
3. Configure DNS:
   - **CNAME**: `your-domain.com` → `your-service.railway.app`
4. Railway automatically provisions SSL certificate

### Recommended Setup

| Service | Domain |
|---------|--------|
| Web | `app.valuerank.ai` |
| API | `api.valuerank.ai` |

---

## Troubleshooting

### Build Failures

```bash
# Check build logs in Railway dashboard
# Common issues:
# - Missing dependencies in package.json
# - TypeScript compilation errors
# - Missing environment variables
```

### Database Connection Issues

```bash
# Verify DATABASE_URL is set
railway variables

# Test connection from API shell
railway shell --service api
npx prisma db pull
```

### Python Worker Failures

```bash
# Check if Python is available
railway shell --service api
python3 --version

# Test worker directly
python3 workers/health_check.py
```

### Service Won't Start

Check for:
1. Missing required environment variables
2. Port conflicts (use `$PORT` not hardcoded)
3. Database not ready (add health check retry)

---

## Security Considerations

### Secrets Management

- Never commit secrets to git
- Use Railway's environment variables for all secrets
- Rotate `JWT_SECRET` periodically
- Rotate LLM API keys if compromised

### Access Control

- Limit Railway project access to necessary team members
- Use separate API keys per environment if possible
- Enable Railway's audit logs for compliance

---

## Cost Estimation

| Component | Approximate Cost |
|-----------|------------------|
| PostgreSQL | $5-20/month |
| API Service | $5-20/month |
| Web (Static) | Free - $5/month |
| **Total** | ~$10-45/month |

Costs scale with usage. Railway charges based on:
- Compute time
- Memory usage
- Database storage

---

## Related Documentation

- [Local Development](./local-development.md) - Running locally
- [Testing Guide](./testing.md) - Test suites and coverage
- [Architecture Overview](../architecture/overview.md) - System design
- [Original Deployment Spec](../preplanning/deployment.md) - Initial planning
- [Stage 17 Spec](../../specs/012-stage-17-production-deployment/spec.md) - Implementation details
