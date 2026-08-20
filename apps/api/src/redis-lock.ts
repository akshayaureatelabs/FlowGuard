import os from "os";

import "./env.js";

/**
 * Optional Redis-backed leader lock for the in-process scheduler.
 * With REDIS_URL set in production, only one API instance holds the lock.
 * Without REDIS_URL, or in local/dev when Redis is down, the lock grants so
 * schedules still fire (single-instance local workflow).
 */

const REDIS_URL = (process.env.REDIS_URL || "").trim();
const LOCK_KEY = "flowguard:scheduler:lock";
const INSTANCE_ID = `${os.hostname()}:${process.pid}`;
const IS_PROD = process.env.NODE_ENV === "production";

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
    if (res === "OK") return true;
    // Another instance holds the lock
    return false;
  } catch (err) {
    const now = Date.now();
    if (now - lastDowngradeLog > 30_000) {
      console.error("[scheduler] Redis lock error:", err);
      lastDowngradeLog = now;
    }
    // Production multi-instance: fail closed (avoid duplicate runs).
    // Local/dev: fail open so schedules still work without Redis.
    if (IS_PROD) return false;
    return true;
  }
}
