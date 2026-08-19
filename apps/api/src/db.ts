import "./env.js";
import { createRequire } from "module";

/**
 * USE_DATABASE values:
 *   "mongo"  → MongoDB (local or Atlas) — no Docker needed
 *   "true"   → Postgres via Prisma
 *   "false" / unset → in-memory (data lost on restart)
 */
const raw = (process.env.USE_DATABASE || "false").toLowerCase();
export const useMongo = raw === "mongo" || raw === "mongodb";
export const usePostgres = raw === "true" || raw === "postgres" || raw === "prisma";
export const useDatabase = useMongo || usePostgres;

export type DbMode = "mongo" | "postgres" | "memory";
export const dbMode: DbMode = useMongo ? "mongo" : usePostgres ? "postgres" : "memory";

const nodeRequire = createRequire(__filename);

/** Lazy Prisma client — only when Postgres mode. */
export function getPrisma(): any {
  if (!usePostgres) return null;
  const g = globalThis as any;
  if (!g.__flowguardPrisma) {
    try {
      const { PrismaClient } = nodeRequire("@prisma/client");
      g.__flowguardPrisma = new PrismaClient();
    } catch (err: any) {
      throw new Error(
        `Prisma client not available. Run: cd apps/api && npx prisma generate. (${err?.message || err})`
      );
    }
  }
  return g.__flowguardPrisma;
}

/** Lazy MongoDB Db handle. */
export async function getMongo(): Promise<any> {
  if (!useMongo) return null;
  const g = globalThis as any;
  if (!g.__flowguardMongo) {
    const { MongoClient } = nodeRequire("mongodb");
    const url =
      process.env.MONGODB_URL ||
      process.env.MONGO_URL ||
      "mongodb://127.0.0.1:27017/flowguard";
    const client = new MongoClient(url);
    await client.connect();
    // Prefer DB name from URL path; fallback flowguard
    const dbName =
      process.env.MONGODB_DB ||
      (() => {
        try {
          const u = new URL(url);
          return (u.pathname || "/flowguard").replace(/^\//, "") || "flowguard";
        } catch {
          return "flowguard";
        }
      })();
    g.__flowguardMongo = client.db(dbName);
    g.__flowguardMongoClient = client;
    console.log(`[db] MongoDB connected → ${dbName}`);
  }
  return g.__flowguardMongo;
}

export const prisma = null as any;
