# FlowGuard

Codeless browser test automation (Ghost Inspector–style) + nexus-dev production path.

## Recommended local setup (Postgres — data survives restart)

### 1. Start Postgres

```cmd
docker compose up -d postgres
```

(Docker Desktop must be running on Windows.)

### 2. Env

```cmd
copy .env.example .env
```

`.env` should have:

```env
USE_DATABASE=true
AUTH_DISABLED=true
DATABASE_URL=postgresql://flowguard:flowguard@localhost:5432/flowguard?schema=public
```

### 3. Install + schema

```cmd
npx pnpm install
cd apps\api
npx prisma generate
npx prisma db push
cd ..\..
```

### 4. Browsers + run

```cmd
cd apps\api
npx playwright install chromium firefox
cd ..\..
npx pnpm dev
```

- Web: http://localhost:3000  
- Health: http://localhost:3001/health → `"database":"postgres"`  
- Docs: http://localhost:3001/docs  

After this, **projects / tests / steps / runs stay in Postgres** — refresh or restart will not wipe them.

---

## Memory-only (no Docker)

```env
USE_DATABASE=false
AUTH_DISABLED=true
```

Data is lost when the API process restarts.

---

## Auth (optional)

With Postgres:

```env
USE_DATABASE=true
AUTH_DISABLED=false
JWT_SECRET=long-random-secret
```

```http
POST /api/auth/register { "email", "password", "name?" }
POST /api/auth/login    { "email", "password" } → { token, user.apiKey }
Authorization: Bearer <token>
X-API-Key: <apiKey>
```

Users are stored in the `User` table when `USE_DATABASE=true`.

---

## Nexus-dev status

| Module | Status |
|--------|--------|
| Auth (JWT + API key) | ✅ |
| Postgres runtime (Prisma) | ✅ `USE_DATABASE=true` |
| API tests (Vitest) | ✅ `pnpm test` |
| E2E smoke | ✅ `apps/web/e2e` |
| Docker Compose | ✅ |
| GitHub Actions CI | ✅ |
| OpenAPI + metrics | ✅ `/docs` `/metrics` `/health` |

## Tests

```cmd
npx pnpm test
```

## Chrome recorder

Load unpacked: `extensions/chrome`
