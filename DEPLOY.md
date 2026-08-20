# Deploying FlowGuard (P0)

**Order:** Atlas → Railway (API) → Vercel (web) → smoke script.

```
Browser / extension ──▶ API (Railway) ──▶ MongoDB Atlas
                           │
                           ├─ Playwright (chrome / firefox / webkit / remote grid)
                           ├─ Scheduler (30s tick; Redis lock if REDIS_URL set)
                           └─ Artifacts (volume and/or S3)
```

---

## 1. MongoDB Atlas

1. Free **M0** cluster → database user + password.
2. Network Access: `0.0.0.0/0` (or Railway IPs).
3. Connection string:

```text
mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/flowguard?retryWrites=true&w=majority
```

Env on API: `USE_DATABASE=mongo` and `MONGODB_URL=<uri>` (repo uses **`MONGODB_URL`**, not `MONGODB_URI`).

---

## 2. Railway — API

1. Deploy from GitHub; `railway.toml` sets `rootDirectory = apps/api`.
2. Prefer **Dockerfile** `apps/api/Dockerfile` so Playwright browsers are present.
3. **Required variables:**

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `USE_DATABASE` | `mongo` |
| `MONGODB_URL` | Atlas URI |
| `AUTH_DISABLED` | `false` |
| `JWT_SECRET` | 32+ random chars |
| `ADMIN_KEY` | strong random (not `flowguard-admin`) |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (comma-separated) |
| `PUBLIC_URL` | `https://your-api.up.railway.app` |

**Optional:**

| Variable | Purpose |
|----------|--------|
| `REDIS_URL` | Leader lock so multi-replica schedulers don’t double-fire |
| `ARTIFACTS_DIR` | e.g. `/data/artifacts` + **Volume** |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_PUBLIC_URL` | Object storage for screenshots |
| `SMTP_*` / `EMAIL_FROM` | Email alerts |
| `PLAYWRIGHT_GRID_URL` | Remote browsers (`ws://` Playwright or `http://` CDP) |

4. Health: `GET /health` → `status: ok`, `database: mongo`, `auth: jwt+apiKey`.

Production **exits on boot** if auth is disabled, JWT is a placeholder, or `ADMIN_KEY` is missing/default.

---

## 3. Vercel — Web

1. Import repo → **Root Directory** `apps/web`.
2. Env: `NEXT_PUBLIC_API_URL=https://<railway-api>`.
3. Deploy → put that origin into Railway `CORS_ORIGINS`.

---

## 4. Post-deploy smoke

```bash
export API_URL=https://your-api.up.railway.app
export ADMIN_KEY=your-prod-admin-key
node scripts/post-deploy-smoke.mjs
```

Manual: register on web → project → env → test → Run → `/admin` with `ADMIN_KEY`.

---

## 5. Chrome extension

`chrome://extensions` → Load unpacked → `extensions/chrome` → set API URL → Sign in (email/password or API key) → record → select project/test → Push.

---

## 6. Already in the product (P1–P3 code)

| Item | Implementation |
|------|----------------|
| Self-healing selectors | `healLocate` in `local-runner.ts` |
| Multi-browser + grid | `settings.browser`, `PLAYWRIGHT_GRID_URL` / `remoteUrl` |
| Extension account sync | popup sign-in + project/test lists |
| Teams + invites | `/teams`, `/api/teams/.../invites` |
| Admin panel | `/admin` |
| CORS allowlist | `CORS_ORIGINS` |
| Redis scheduler lock | `REDIS_URL` + `redis-lock.ts` |
| S3 artifacts | `s3-artifacts.ts` when S3_* set |

---

## 7. Ops (P1–P2)

| Task | Action |
|------|--------|
| Artifacts survive restarts | Railway volume on `ARTIFACTS_DIR` and/or S3 |
| Custom domain | Vercel + Railway domains; refresh `CORS_ORIGINS` + `PUBLIC_URL` |
| Uptime | Monitor `GET /health` every 1–5 minutes |
