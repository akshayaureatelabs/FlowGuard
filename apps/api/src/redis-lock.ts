import os from "os";

import "./env.js";

/**
 * Optional Redis-backed leader lock for the in-process scheduler.
 * With REDIS_URL set, only one API instance holds the lock at a time so
 * multi-instance deploys don't double-trigger schedules. Without REDIS_URL the
 * lock always grants (previous single-instance behavior unchanged).
 */

const REDIS_URL = process.env.REDIS_URL || "";
const LOCK_KEY = "flowguard:scheduler:lock";
const INSTANCE_ID = `${os.hostname()}:${process.pid}`;

let client: any = null;
let lastDowngradeLog = 0;

export async function acquireSchedulerLock(ttlMs = 65_000): Promise<boolean> {
  if (!REDIS_URL) return true;
  try {
    if (!client) {
      const { Redis } = await import("ioredis");
      client = new Redis(REDIS_URL, {
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (): number => 2000,
      });
    }
    const res = await client.set(LOCK_KEY, INSTANCE_ID, "PX", ttlMs, "NX");
    return res === "OK";
  } catch (err) {
    // Fail closed: if Redis is unreachable we must NOT run the scheduler,
    // otherwise multiple instances would each try to trigger the same runs.
    const now = Date.now();
    if (now - lastDowngradeLog > 30_000) {
      console.error("[scheduler] Redis lock unavailable — skipping tick to avoid duplicate runs:", err);
      lastDowngradeLog = now;
    }
    return false;
  }
}