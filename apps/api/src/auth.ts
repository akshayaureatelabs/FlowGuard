import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { usePostgres, useMongo, useDatabase, getPrisma, getMongo } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/** Auth off when AUTH_DISABLED=true OR memory mode (no DB). */
export const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || !useDatabase;

const PLACEHOLDER_JWT_SECRETS = new Set(["dev-secret-change-me", "change-me-in-development", "change-me"]);

/**
 * Fail fast in production: multi-user isolation must be on with a real
 * JWT_SECRET. Mirrors the ADMIN_KEY startup check.
 */
export function assertAuthSafety(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (AUTH_DISABLED) {
    throw new Error(
      "[auth] AUTH_DISABLED=true is not allowed in production — set AUTH_DISABLED=false (multi-user isolation) and a strong JWT_SECRET."
    );
  }
  if (!process.env.JWT_SECRET || PLACEHOLDER_JWT_SECRETS.has(process.env.JWT_SECRET)) {
    throw new Error(
      "[auth] JWT_SECRET must be set to a strong random value in production (placeholder values are refused)."
    );
  }
}

export type AuthUser = {
  id: string;
  email: string;
  apiKey?: string;
  name?: string;
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  apiKey: string;
  name?: string | null;
};

const memUsers = new Map<string, StoredUser>();

async function usersCol() {
  const db = await getMongo();
  return db.collection("users");
}

async function findByEmail(email: string): Promise<StoredUser | undefined> {
  if (useMongo) {
    const u = await (await usersCol()).findOne({ email });
    return u ? strip(u) : undefined;
  }
  if (usePostgres) {
    const u = await getPrisma().user.findUnique({ where: { email } });
    return u || undefined;
  }
  return [...memUsers.values()].find((u) => u.email === email);
}

async function findByApiKey(apiKey: string): Promise<StoredUser | undefined> {
  if (useMongo) {
    const u = await (await usersCol()).findOne({ apiKey });
    return u ? strip(u) : undefined;
  }
  if (usePostgres) {
    const u = await getPrisma().user.findUnique({ where: { apiKey } });
    return u || undefined;
  }
  return [...memUsers.values()].find((u) => u.apiKey === apiKey);
}

async function findById(id: string): Promise<StoredUser | undefined> {
  if (useMongo) {
    const u = await (await usersCol()).findOne({ id });
    return u ? strip(u) : undefined;
  }
  if (usePostgres) {
    const u = await getPrisma().user.findUnique({ where: { id } });
    return u || undefined;
  }
  return memUsers.get(id);
}

function strip(doc: any): StoredUser {
  const { _id, ...rest } = doc;
  return rest as StoredUser;
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await findByEmail(email);
  if (existing) throw new Error("Email already registered");
  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = uuid();

  if (useMongo) {
    const user: StoredUser = {
      id: uuid(),
      email,
      passwordHash,
      apiKey,
      name: name || null,
    };
    await (await usersCol()).insertOne({ ...user });
    return { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name ?? undefined };
  }

  if (usePostgres) {
    const user = await getPrisma().user.create({
      data: { email, passwordHash, apiKey, name: name || null },
    });
    return { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name ?? undefined };
  }

  const user: StoredUser = {
    id: uuid(),
    email,
    passwordHash,
    apiKey,
    name,
  };
  memUsers.set(user.id, user);
  return { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name ?? undefined };
}

export async function loginUser(email: string, password: string) {
  const user = await findByEmail(email);
  if (!user) throw new Error("Invalid credentials");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid credentials");
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      apiKey: user.apiKey,
      name: user.name ?? undefined,
    },
  };
}

export function findUserByApiKey(apiKey: string) {
  return findByApiKey(apiKey);
}

export function findUserById(id: string) {
  return findById(id);
}

export type AdminUser = {
  id: string;
  email: string;
  name?: string | null;
  apiKey?: string;
  createdAt?: string;
};

export async function listUsers(): Promise<AdminUser[]> {
  if (useMongo) {
    const docs = await (await usersCol())
      .find({})
      .sort({ _id: 1 })
      .toArray();
    return docs.map((d: any) => {
      const { _id, passwordHash, ...u } = d;
      return u as AdminUser;
    });
  }
  if (usePostgres) {
    const rows = await getPrisma().user.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      apiKey: r.apiKey,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    }));
  }
  return [...memUsers.values()].map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    apiKey: u.apiKey,
  }));
}

export async function deleteUser(id: string): Promise<boolean> {
  if (useMongo) {
    const r = await (await usersCol()).deleteOne({ id });
    return r.deletedCount > 0;
  }
  if (usePostgres) {
    try {
      await getPrisma().user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  return memUsers.delete(id);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    req.user = { id: "local", email: "local@flowguard.dev" };
    return next();
  }

  const header = req.headers.authorization || "";
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

  try {
    if (apiKeyHeader) {
      const user = await findByApiKey(apiKeyHeader);
      if (!user) return res.status(401).json({ error: "Invalid API key" });
      req.user = {
        id: user.id,
        email: user.email,
        apiKey: user.apiKey,
        name: user.name ?? undefined,
      };
      return next();
    }

    if (header.startsWith("Bearer ")) {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
        sub: string;
        email: string;
      };
      req.user = { id: payload.sub, email: payload.email };
      return next();
    }
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  return res.status(401).json({ error: "Unauthorized" });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    req.user = { id: "local", email: "local@flowguard.dev" };
  }
  next();
}

export { JWT_SECRET };
