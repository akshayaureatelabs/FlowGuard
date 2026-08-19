# FlowGuard

Codeless browser test automation (Ghost Inspector–style).

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
npx playwright install chromium firefox
cd ..\..
npx pnpm dev
```

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

Users store in Mongo `users` collection when `USE_DATABASE=mongo`.

---

## URLs

- Web: http://localhost:3000  
- API: http://localhost:3001/health  
- Docs: http://localhost:3001/docs  
