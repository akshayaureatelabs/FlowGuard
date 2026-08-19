import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { useDatabase, getPrisma } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/** Auth off when AUTH_DISABLED=true OR when not using database (local memory MVP). */
export const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || process.env.USE_DATABASE !== "true";

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

async function findByEmail(email: string): Promise<StoredUser | undefined> {
  if (useDatabase) {
    const u = await getPrisma().user.findUnique({ where: { email } });
    return u || undefined;
  }
  return [...memUsers.values()].find((u) => u.email === email);
}

async function findByApiKey(apiKey: string): Promise<StoredUser | undefined> {
  if (useDatabase) {
    const u = await getPrisma().user.findUnique({ where: { apiKey } });
    return u || undefined;
  }
  return [...memUsers.values()].find((u) => u.apiKey === apiKey);
}

async function findById(id: string): Promise<StoredUser | undefined> {
  if (useDatabase) {
    const u = await getPrisma().user.findUnique({ where: { id } });
    return u || undefined;
  }
  return memUsers.get(id);
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await findByEmail(email);
  if (existing) throw new Error("Email already registered");
  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = uuid();

  if (useDatabase) {
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
      req.user = { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name ?? undefined };
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
