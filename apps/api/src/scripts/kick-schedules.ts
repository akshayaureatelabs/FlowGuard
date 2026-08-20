/**
 * Set all enabled schedules to fire within ~10s (local testing).
 * From repo root (API deps installed):
 *   npx pnpm --filter @flowguard/api exec tsx src/scripts/kick-schedules.ts
 */
import { repo } from "../repo.js";
import { computeFirstRunIso } from "../schedule.js";

async function main() {
  const all = await repo.listSchedules();
  let n = 0;
  for (const s of all) {
    if (!s.enabled) continue;
    await repo.updateSchedule(s.id, { nextRunAt: computeFirstRunIso(10) });
    n++;
    console.log("kicked", s.id, "test", s.testId);
  }
  console.log("done", n, "schedule(s)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
