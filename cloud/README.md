# Cloud ValueRank

Cloud-native version of the ValueRank AI moral values evaluation framework.

## Quick Start

1. Start PostgreSQL:
   ```bash
   docker-compose up -d
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment:
   ```bash
   cp .env.example .env
   ```

4. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

5. Push database schema:
   ```bash
   npm run db:push
   ```

6. Start development servers:
   ```bash
   npm run dev
   ```

- API: http://localhost:3031
- Web: http://localhost:3030

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in dev mode |
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all code |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |

## Project Structure

```
cloud/
├── apps/
│   ├── api/         # Express API server (port 3001)
│   └── web/         # React frontend (port 3000)
├── packages/
│   ├── db/          # Prisma database client
│   └── shared/      # Shared utilities (logger, env, errors)
└── docker/          # Docker configuration (future)
```
