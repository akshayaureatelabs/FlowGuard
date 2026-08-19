# Deploying FlowGuard

FlowGuard is a monorepo with an Express API (`apps/api`), a Next.js web app
(`apps/web`), and a Chrome recorder extension (`extensions/chrome`). This guide
covers production deployment with the three recommended hosts: MongoDB Atlas
(database), Railway (API), and Vercel (web).

## Architecture

```
Browser extension ─▶ FlowGuard API (Express) ─▶ MongoDB Atlas
                          │  │
                          │  └─▶ Playwright (local execution / Selenium grid / Playwright grid)
                          └─▶ Scheduled runs (in-process scheduler, 30s tick)
```

- The API performs test runs **locally in-process** using Playwright. The
  official Playwright Docker image ships Chrome, Firefox, and WebKit, so Safari
  ("WebKit") tests work out of the box in the container.
- Notifications are delivered by the API to per-schedule + per-project
  `notifyEmail`/`notifyWebhook` targets when a run finishes (any result) or a
  scheduled run fails.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port. Railway sets this automatically. |
| `USE_DATABASE` | `false` (memory) | `mongo` or `true`/`postgres`. Set `mongo`. |
| `MONGODB_URI` | — | Atlas connection string when `USE_DATABASE=mongo`. |
| `DATABASE_URL` | — | Postgres connection string when `USE_DATABASE=postgres` (Prisma). |
| `AUTH_DISABLED` | `true` | `false` to enable JWT login + API keys. **Set `false` in production.** |
| `JWT_SECRET` | dev value | **Must be a long random secret in production.** |
| `USE_LOCAL_EXECUTION` | `true` | `false` to delegate runs to a remote runner. |
| `PLAYWRIGHT_GRID_URL` | — | Optional Playwright/Selenium grid endpoint. `ws://`/`wss://` connects via Playwright, `http(s)://` via CDP. |
| `ARTIFACTS_DIR` | `./artifacts` | Where screenshots/diffs/videos are stored. Use a persistent volume. |
| `RATE_LIMIT_MAX` | `300` | API requests per minute per IP. |
| `CORS_ORIGIN` | `*` | Restrict web origins if desired. |

## 1. Database — MongoDB Atlas

1. Create a free M0 cluster at https://www.mongodb.com/atlas.
2. Add a database user and allow your API host's IP (or `0.0.0.0/0`).
3. Copy the connection string, e.g.
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/flowguard`.
4. Set `USE_DATABASE=mongo` and `MONGODB_URI=<connection string>` on Railway.

## 2. API — Railway

1. Create a Railway project from the repo root, **Dockerfile** (`apps/api/Dockerfile`).
2. Add a **Volume** mounted at `/app/apps/api/artifacts` so screenshots survive redeploys.
3. Set the environment variables from the table above.
4. Add `PORT` (Railway injects it) and the Atlas URI.
5. Deploy. Health check: `GET /health`.

Local build sanity check:

```bash
docker build -f apps/api/Dockerfile -t flowguard-api .
docker run --rm -p 3001:3001 \
  -e USE_DATABASE=mongo \
  -e MONGODB_URI="mongodb+srv://..." \
  -e AUTH_DISABLED=false \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  flowguard-api
```

## 3. Web — Vercel

1. Import `apps/web` as a new Vercel project (root directory: `apps/web`).
2. The app reads the API URL at runtime from a client-side setting in the
   **Chrome extension / login screen**, and the extension defaults to the API
   URL stored in its popup. Set a Next.js env var if you want a default:
   - `NEXT_PUBLIC_API_URL` — default API origin the web app talks to.
3. Deploy. The web app is a static client; CORS must allow the Vercel origin
   (the API currently sends `Access-Control-Allow-Origin: *`, which works for
   public deployments).

## 4. Chrome extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → `extensions/chrome`.
3. Open the popup, set your API URL, and **Sign in** with the credentials you
   registered against the deployed API (or an API key).
4. Record steps, pick a project + test, and push. `Authorization: Bearer` (or
   `x-api-key`) is sent automatically.

## Scheduling in production

Scheduled runs execute in the API process on a 30-second tick. If you scale to
multiple API replicas, each instance runs the scheduler — use a single replica
for the scheduler instance, or externalize scheduling (e.g. cron hitting
`POST /api/tests/:id/runs`) to avoid duplicate runs.

## Verifying a deployment

```bash
# API health
curl -s https://<api-url>/health

# Auth required (AUTH_DISABLED=false)
curl -s https://<api-url>/api/auth/me \
  -H "Authorization: Bearer <token>"

# Create a project + env + test, run it
curl -s -X POST https://<api-url>/api/projects \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"name":"Smoke"}'
```

Open the web app, add an environment pointing at your staging site, record a
few steps, and press **Run**. Watch the step timeline for screenshots and the
self-healing badge (a healed selector shows the original → replacement path).
