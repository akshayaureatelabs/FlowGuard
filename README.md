# FlowGuard

**Codeless browser test automation & monitoring** — Ghost Inspector-style platform.

## Feature parity (vs Ghost Inspector non-coding)

| Feature | Status |
|---------|--------|
| Codeless step editor (add/reorder/edit) | ✅ |
| Operations: navigate, click, type, clear, select, hover, wait | ✅ |
| Assertions (URL, text, visibility, attributes, count) | ✅ |
| CSS selectors + backup/self-healing | ✅ |
| JavaScript steps | ✅ |
| Screenshots | ✅ |
| Reusable modules | ✅ API |
| Accessibility checks (basic WCAG heuristics) | ✅ |
| Visual regression (baseline compare) | ✅ MVP |
| Browser choice (Chrome / Firefox) | ✅ |
| Viewport / screen size | ✅ |
| Scheduling (interval minutes + auto-run) | ✅ |
| Parallel flag on test settings | ✅ schema |
| Webhooks / email notify fields on schedule | ✅ schema |
| Browser extension recorder | ⏳ next |
| Multi-geo data centers | ⏳ cloud phase |
| Safari / Edge full matrix | ⏳ cloud phase |
| Pixel-perfect visual + axe-core | ⏳ enhance |

## Local start

```bash
copy .env.example .env   # Windows
pnpm install             # or: npx pnpm install
cd apps/api && npx playwright install chromium firefox && cd ../..
npx pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:3001/health  

Keep `USE_DATABASE=false` and `USE_LOCAL_EXECUTION=true` for the MVP.

## Architecture

- `apps/web` — Next.js dashboard + step editor  
- `apps/api` — Express API + in-memory store + Playwright runner + scheduler  
- `apps/worker` — placeholder for future BullMQ cloud workers  
- `packages/shared` — Zod schemas / types  

## License

Private / TBD
