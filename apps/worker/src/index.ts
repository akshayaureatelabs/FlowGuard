/**
 * FlowGuard Worker
 * For the local MVP the Playwright runner lives inside the API
 * (USE_LOCAL_EXECUTION=true). This package is the future home of the
 * BullMQ / Redis-backed cloud runner.
 *
 * Keep this process alive so `pnpm --filter ./apps/* dev` succeeds.
 */
console.log("[worker] FlowGuard worker ready (local mode – runner is in API)");
setInterval(() => {}, 60_000);
