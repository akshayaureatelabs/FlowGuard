# FlowGuard

FlowGuard is a browser test automation and monitoring platform. This repository currently contains the initial monorepo foundation.

## Start — Docker-free local MVP

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Keep `USE_DATABASE=false` and `USE_LOCAL_EXECUTION=true` for the local MVP.
4. Start the API and web app with their workspace dev commands.

The local MVP uses an in-memory store and a local `artifacts/` directory. PostgreSQL, Redis, MinIO, Docker, authentication, and BullMQ are optional upgrades for a later production-oriented phase.
