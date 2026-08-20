import { CronExpressionParser } from "cron-parser";

/**
 * Compute the next run time for a schedule from its cron expression or
 * interval (minutes). Falls back to interval-based scheduling when the cron
 * expression is invalid or absent.
 */
export function computeNextRun(
  cron?: string,
  intervalMinutes?: number
): Date {
  const interval = intervalMinutes || 60;
  if (cron) {
    try {
      return CronExpressionParser.parse(cron).next().toDate();
    } catch (err) {
      console.warn(
        `[schedule] invalid cron "${cron}" (${(err as Error).message}); falling back to ${interval}m interval`
      );
    }
  }
  return new Date(Date.now() + interval * 60_000);
}

export function computeNextRunIso(
  cron?: string,
  intervalMinutes?: number
): string {
  return computeNextRun(cron, intervalMinutes).toISOString();
}

/**
 * First scheduled fire: soon (default 15s) so "Add schedule" is testable without
 * waiting a full hour. Subsequent ticks use computeNextRun / cron.
 */
export function computeFirstRunIso(delaySec = 15): string {
  return new Date(Date.now() + Math.max(5, delaySec) * 1000).toISOString();
}
