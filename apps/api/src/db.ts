import { PrismaClient } from "@prisma/client";

export const useDatabase = process.env.USE_DATABASE === "true";

export const prisma = useDatabase
  ? new PrismaClient()
  : (null as unknown as PrismaClient);
