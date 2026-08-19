# FlowGuard

Codeless browser test automation (Ghost Inspector–style).

Features: step editor, reusable modules, scheduled runs, **run history + screenshot gallery + step timeline**, **visual diffs (pixelmatch)**, **a11y scans (axe-core)**, Slack/webhook + **email alerts on failure**, and an optional **browser recorder that pushes steps straight into a test**.

## Recommended: MongoDB (no Docker)

Data survives restart. No Docker required.

### Option A — Local MongoDB (Windows)

1. Install: https://www.mongodb.com/try/download/community  
   (or `winget install MongoDB.Server`)
2. Service start ho jaye (default port `27017`).

### Option B — Free MongoDB Atlas (cloud)

1. https://cloud.mongodb.com → free cluster  
2. Database user + Network Access `0.0.0.0/0` (dev)  
3. Connection string copy karo

### Env

```cmd
git pull
copy /Y .env.example .env
```

`.env`:

```env
USE_DATABASE=mongo
MONGODB_URL=mongodb://127.0.0.1:27017/flowguard
AUTH_DISABLED=true
```

Atlas:

```env
USE_DATABASE=mongo
MONGODB_URL=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/flowguard
AUTH_DISABLED=true
```

### Run

```cmd
npx pnpm install
cd apps\api
pnpm exec playwright install chromium firefox
cd ..\..
npx pnpm dev
```

> ⚠️ **Browser install gotcha:** use `pnpm exec playwright install` (or
> `node_modules\.bin\playwright install`) from `apps/api` so the correct
> Playwright version's browsers are downloaded. Plain `npx playwright install`
> can silently resolve a different cached version and test runs will fail with
> "Executable doesn't exist".

Health check: http://localhost:3001/health → `"database":"mongo"`

Projects / tests / runs ab **refresh / restart pe nahi udhenge**.

---

## Other modes

| `USE_DATABASE` | Backend |
|----------------|---------|
| `mongo` | MongoDB (local / Atlas) — **recommended, no Docker** |
| `true` | Postgres (Prisma) |
| `false` | In-memory (data lost on restart) |

---

## Auth (optional)

```env
AUTH_DISABLED=false
JWT_SECRET=long-random-secret
```

Users store in Mongo `users` collection when `USE_DATABASE=mongo`. Auth supports
JWT (`Authorization: Bearer …`) and API key (`x-api-key`). Each user only sees
their own projects (multi-user isolation). Legacy projects created before
ownership was added remain visible to everyone.

---

## Alerts on failure

Schedule a test and set a notify email and/or webhook. On a failed/error run
FlowGuard posts a JSON payload to the webhook (Slack-compatible) and/or sends an
email via SMTP.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
EMAIL_FROM="FlowGuard <you@gmail.com>"
PUBLIC_URL=https://api.example.com
```

Webhooks fire even without SMTP. If `SMTP_*` is unset, emails are logged instead
of sent (so local dev doesn't break).

---

## Browser recorder

`extensions/chrome` — load as an unpacked extension, press **Start recording**,
then optionally **Push steps to test** with the API URL + test ID + API key
(needed when auth is enabled). You can also copy the JSON and paste it via
**Import JSON** in the test editor.

---

## Deploy

### Web (Vercel)

1. New project → import `apps/web` (existing `apps/web/vercel.json`)
2. Environment variable: `NEXT_PUBLIC_API_URL=https://<your-api>.up.railway.app`

### API (Railway / Docker)

1. `railway.toml` at the repo root defines `rootDirectory = "apps/api"` and a
   `healthcheckPath = "/health"` (Railway auto-detects).
2. Set env vars in the dashboard:
   - `MONGODB_URL` → your Atlas connection string
   - `AUTH_DISABLED=false`, `JWT_SECRET` (long random)
   - `PUBLIC_URL`, `SMTP_*`, `EMAIL_FROM` (optional, for alerts)
   - `ARTIFACTS_DIR` → persistent volume path if you want screenshots to survive restarts

Docker images: `apps/api/Dockerfile` and `apps/web/Dockerfile`.

---

## URLs

- Web: http://localhost:3000  
- API: http://localhost:3001/health  
- Docs: http://localhost:3001/docs  
- Run artifacts (screenshots): http://localhost:3001/artifacts/…