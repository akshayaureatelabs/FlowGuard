import type { Step, StepResult, Test } from "@flowguard/shared";
import { repo } from "./repo.js";

/** After a successful heal, store the replacement selector as a backup on the test step. */
export async function persistHealedSelectors(
  test: Test,
  results: StepResult[]
): Promise<number> {
  const heals = results.filter((r) => r.meta && (r.meta as any).healed?.to);
  if (!heals.length) return 0;

  let changed = 0;
  const steps: Step[] = JSON.parse(JSON.stringify(test.steps || []));

  for (const r of heals) {
    const healed = (r.meta as any).healed as { from?: string; to: string };
    const step = steps.find((s) => s.id === r.stepId) as any;
    if (!step?.config?.selector?.primary) continue;
    const sel = step.config.selector;
    const backups: string[] = Array.isArray(sel.backups) ? [...sel.backups] : [];
    if (healed.to && !backups.includes(healed.to) && healed.to !== sel.primary) {
      backups.unshift(healed.to);
      sel.backups = backups.slice(0, 8);
      changed += 1;
    }
  }

  if (changed > 0) {
    await repo.updateSteps(test.id, steps);
  }
  return changed;
}
