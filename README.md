# FlowGuard

**Codeless browser test automation & monitoring platform**  
Ghost Inspector-style experience — anyone on the team can record, edit, schedule and monitor browser tests without writing code.

## Vision

FlowGuard lets non-developers create, maintain and run reliable end-to-end browser tests in minutes.  
Record in the browser → edit visually → schedule continuous monitoring → get instant alerts with screenshots & video.

## Core Features (Non-Coding Focus)

### 1. Codeless Test Editor
- Drag-and-drop add / remove / reorder steps
- Full set of user operations (click, type, hover, drag-drop, select, etc.)
- Assertions (URL, text, element visible/enabled, attribute, count…)
- CSS + XPath selectors with backup / self-healing
- JavaScript steps + conditional branching
- Reusable modules (login, checkout, etc.)

### 2. Web Test Recorder
- Browser extensions: Chrome, Edge, Firefox, Safari
- Automatic capture of clicks, form fills, navigation
- Add assertions & screenshots while recording
- One-click sync to FlowGuard cloud / local runner

### 3. Parallel Testing
- Parallel execution by default
- Sequential mode available when needed

### 4. Advanced Scheduling & Monitoring
- Run every minute or at specific days/times
- Instant alerts: Email, Slack, PagerDuty, Webhooks
- Screenshot + video attached to every failure

### 5. Accessibility Testing
- WCAG checks on any step / page
- Detailed violation reports with rule references

### 6. Visual Regression Testing
- Automatic screenshot comparison against baseline
- Region-only captures
- Configurable sensitivity + ignore dynamic elements
- Visual diffs in results

### 7. Cross-browser / Viewport / Geolocation
- Browsers: Chrome, Firefox, Edge, Safari (multiple versions)
- Screen sizes: mobile, tablet, desktop + custom viewports
- Multiple geolocations / data-center IPs

## Tech Stack (Monorepo)

- **apps/web**     → Next.js dashboard + codeless editor UI
- **apps/api**     → REST API (projects, tests, runs, schedules)
- **apps/worker**  → Playwright-based test runner + artifact storage
- **packages/**    → Shared types, selectors, assertion helpers, modules

## Local MVP (Docker-free)

```bash
cp .env.example .env
pnpm install
# Keep USE_DATABASE=false and USE_LOCAL_EXECUTION=true
pnpm dev
```

Artifacts are stored in `./artifacts`.  
PostgreSQL, Redis, MinIO, auth and BullMQ are optional for later production phase.

## Project Structure

```
FlowGuard/
├── apps/
│   ├── web/                 # Next.js – dashboard + visual editor
│   ├── api/                 # Backend (projects, tests, runs, schedules)
│   └── worker/              # Playwright executor + artifact handling
├── packages/
│   ├── shared/              # Types, step schema, assertions
│   ├── selectors/           # CSS/XPath + self-healing logic
│   └── modules/             # Reusable step modules
├── extensions/              # (future) Chrome/Edge/Firefox/Safari recorder
├── artifacts/               # Local screenshots / videos / diffs
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Roadmap

- [x] Monorepo foundation
- [ ] Project / Environment / Test CRUD
- [ ] Step editor (drag-drop + operations + assertions)
- [ ] Local Playwright runner
- [ ] Browser extension (recorder)
- [ ] Parallel execution
- [ ] Scheduling + notifications
- [ ] Visual regression
- [ ] Accessibility checks
- [ ] Multi-browser / viewport / geo support
- [ ] Reusable modules
- [ ] Cloud runner + production hardening

## License

Private / TBD
