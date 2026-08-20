# CRITICAL: restore `apps/api/src/index.ts`

Main currently has a broken `index.ts` (accidental overwrite). Local API will not start until you restore it.

## Windows (repo root)

```cmd
curl -L -o apps\api\src\index.ts "https://raw.githubusercontent.com/akshayaureatelabs/FlowGuard/1f8d5aaba3ab1712453bc513a71832f88edc28cf/apps/api/src/index.ts"
```

Or:

```cmd
git show 1f8d5aaba3ab1712453bc513a71832f88edc28cf:apps/api/src/index.ts > apps\api\src\index.ts
```

## Mount new features (required)

In `apps/api/src/index.ts`:

1. After the `admin.js` import, add:

```ts
import { featuresRouter } from "./features-router.js";
import { featuresStore } from "./features-store.js";
```

2. After `app.use("/api", authMiddleware);` add:

```ts
app.use("/api", featuresRouter);
```

Optional — auto version on step save (inside `PUT /api/tests/:id/steps`, before `updateSteps`):

```ts
const before = await repo.getTest(req.params.id);
if (before?.steps?.length) {
  await featuresStore.saveVersion(before.id, before.steps, before.settings, "auto-save").catch(() => {});
}
```

## Commit + run

```cmd
git add apps/api/src/index.ts
git commit -m "fix(api): restore index.ts + mount features router"
git push
npx pnpm dev
```

Verify: http://localhost:3001/health
