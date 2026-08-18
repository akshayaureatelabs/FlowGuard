import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" ||
  process.env.USE_DATABASE === "false";

export type AuthUser = {
  id: string;
  email: string;
  apiKey?: string;
};

// In-memory users when DB is off
const memUsers = new Map<
  string,
  { id: string; email: string; passwordHash: string; apiKey: string; name?: string }
>();

export async function registerUser(email: string, password: string, name?: string) {
  const existing = [...memUsers.values()].find((u) => u.email === email);
  if (existing) throw new Error("Email already registered");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(),
    email,
    passwordHash,
    apiKey: uuid(),
    name,
  };
  memUsers.set(user.id, user);
  return { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name };
}

export async function loginUser(email: string, password: string) {
  const user = [...memUsers.values()].find((u) => u.email === email);
  if (!user) throw new Error("Invalid credentials");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid credentials");
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return {
    token,
    user: { id: user.id, email: user.email, apiKey: user.apiKey, name: user.name },
  };
}

export function findUserByApiKey(apiKey: string) {
  return [...memUsers.values()].find((u) => u.apiKey === apiKey);
}

export function findUserById(id: string) {
  return memUsers.get(id);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    req.user = { id: "local", email: "local@flowguard.dev" };
    return next();
  }

  const header = req.headers.authorization || "";
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

  if (apiKeyHeader) {
    const user = findUserByApiKey(apiKeyHeader);
    if (!user) return res.status(401).json({ error: "Invalid API key" });
    req.user = { id: user.id, email: user.email, apiKey: user.apiKey };
    return next();
  }

  if (header.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
        sub: string;
        email: string;
      };
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  return res.status(401).json({ error: "Unauthorized" });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    req.user = { id: "local", email: "local@flowguard.dev" };
  }
  next();
}

export { JWT_SECRET, AUTH_DISABLED };
