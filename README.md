# FlowGuard

Codeless browser test automation (Ghost Inspector–style) + nexus-dev production path.

## Nexus-dev status

| Module | Status |
|--------|--------|
| Auth (JWT + API key) | ✅ (`AUTH_DISABLED=true` for local) |
| Postgres schema (Prisma) | ✅ (`USE_DATABASE=true` when ready) |
| API tests (Vitest) | ✅ `pnpm test` |
| E2E smoke (Playwright) | ✅ `apps/web/e2e` |
| Docker Compose | ✅ |
| GitHub Actions CI | ✅ |
| OpenAPI + metrics | ✅ `/docs` `/metrics` `/health` |

## Local (memory store, auth off)

```cmd
copy .env.example .env
npx pnpm install
cd apps\api && npx playwright install chromium firefox && cd ..\..
npx pnpm dev
```

- Web: http://localhost:3000
- API health: http://localhost:3001/health
- OpenAPI UI: http://localhost:3001/docs
- Metrics: http://localhost:3001/metrics

## Auth

When `USE_DATABASE=false` (default), `AUTH_DISABLED` is effectively on so the UI keeps working without tokens.

Enable auth for staging/prod:

```env
USE_DATABASE=true
AUTH_DISABLED=false
JWT_SECRET=long-random-secret
```

```http
POST /api/auth/register { "email", "password", "name?" }
POST /api/auth/login    { "email", "password" } → { token, user.apiKey }
Authorization: Bearer <token>
# or
X-API-Key: <apiKey>
```

## Postgres

```bash
docker compose up -d postgres
# set USE_DATABASE=true in .env
cd apps/api && npx prisma db push
```

> Note: runtime still uses the in-memory store until a full Prisma repository layer is wired; schema + migrate path is ready.

## Tests

```bash
pnpm test                          # API vitest
# with web + api already running:
cd apps/web && npx playwright test
```

## Docker

```bash
docker compose up --build
```

## Chrome recorder

Load unpacked: `extensions/chrome`
