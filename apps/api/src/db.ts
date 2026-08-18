import { createRequire } from "module";

export const useDatabase = process.env.USE_DATABASE === "true";

const require = createRequire(import.meta.url);

/** Lazy Prisma client — only loads @prisma/client when USE_DATABASE=true. */
export function getPrisma(): any {
  if (!useDatabase) return null;
  const g = globalThis as any;
  if (!g.__flowguardPrisma) {
    try {
      const { PrismaClient } = require("@prisma/client");
      g.__flowguardPrisma = new PrismaClient();
    } catch (err: any) {
      throw new Error(
        `Prisma client not available. Run: cd apps/api && npx prisma generate. (${err?.message || err})`
      );
    }
  }
  return g.__flowguardPrisma;
}

/** @deprecated use getPrisma() */
export const prisma = null as any;
