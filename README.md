# FlowGuard

Codeless browser test automation & monitoring (Ghost Inspector–style).

## Status vs Ghost Inspector (non-coding)

| Feature | Status |
|---------|--------|
| Codeless step editor | ✅ |
| Operations (nav/click/type/clear/select/hover/wait) | ✅ |
| Assertions | ✅ |
| Self-healing selectors (backups) | ✅ |
| JavaScript steps | ✅ |
| Screenshots | ✅ |
| Accessibility step | ✅ |
| Visual regression baselines | ✅ MVP |
| Reusable modules (API + project UI) | ✅ |
| Chrome / Firefox + viewport | ✅ |
| Scheduling + pause/resume UI | ✅ |
| Chrome recorder extension | ✅ (`extensions/chrome`) |
| Multi-geo / Safari matrix | ⏳ cloud |
| Live Slack/PagerDuty send | ⏳ schema ready |

## Quick start (Windows)

```cmd
git pull
copy .env.example .env
npx pnpm install
cd apps\api
npx playwright install chromium firefox
cd ..\..
npx pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/health

## Chrome recorder

1. Chrome → `chrome://extensions` → Developer mode
2. Load unpacked → `extensions/chrome`
3. Start recording on any site → Copy steps JSON
4. Paste into test steps via editor / API `PUT /api/tests/:id/steps`

## Stack

- `apps/web` — Next.js UI
- `apps/api` — Express + Playwright + in-memory store + scheduler
- `apps/worker` — future queue workers
- `packages/shared` — Zod types
- `extensions/chrome` — MV3 recorder

Keep `USE_DATABASE=false` and `USE_LOCAL_EXECUTION=true` for local MVP.
