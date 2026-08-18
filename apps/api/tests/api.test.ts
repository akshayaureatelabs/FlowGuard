import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import {
  CreateProjectBody,
  CreateEnvironmentBody,
  CreateTestBody,
} from "@flowguard/shared";
import { store } from "../src/store.js";
import {
  authMiddleware,
  registerUser,
  loginUser,
  AUTH_DISABLED,
} from "../src/auth.js";

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const user = await registerUser(req.body.email, req.body.password, req.body.name);
      res.status(201).json(user);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = await loginUser(req.body.email, req.body.password);
      res.json(result);
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });

  app.get("/api/projects", authMiddleware, (_req, res) => {
    res.json(store.listProjects());
  });

  app.post("/api/projects", authMiddleware, (req, res) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(store.createProject(parsed.data.name));
  });

  app.post("/api/projects/:projectId/environments", authMiddleware, (req, res) => {
    if (!store.getProject(req.params.projectId))
      return res.status(404).json({ error: "Project not found" });
    const parsed = CreateEnvironmentBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(
      store.createEnvironment(
        req.params.projectId,
        parsed.data.name,
        parsed.data.baseUrl
      )
    );
  });

  app.post("/api/projects/:projectId/tests", authMiddleware, (req, res) => {
    if (!store.getProject(req.params.projectId))
      return res.status(404).json({ error: "Project not found" });
    const parsed = CreateTestBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(store.createTest(req.params.projectId, parsed.data.name));
  });

  app.put("/api/tests/:id/steps", authMiddleware, (req, res) => {
    const steps = (req.body.steps || []).map((s: any) => ({ ...s, id: s.id || uuid() }));
    const test = store.updateSteps(req.params.id, steps);
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.json(test);
  });

  return app;
}

describe("FlowGuard API", () => {
  const app = buildApp();

  it("health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("register + login issues token", async () => {
    const email = `user-${Date.now()}@test.com`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "secret123", name: "QA" });
    expect(reg.status).toBe(201);
    expect(reg.body.apiKey).toBeTruthy();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "secret123" });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  it("project → env → test → steps CRUD", async () => {
    const p = await request(app).post("/api/projects").send({ name: "Demo" });
    expect(p.status).toBe(201);

    const env = await request(app)
      .post(`/api/projects/${p.body.id}/environments`)
      .send({ name: "Prod", baseUrl: "https://example.com" });
    expect(env.status).toBe(201);

    const test = await request(app)
      .post(`/api/projects/${p.body.id}/tests`)
      .send({ name: "Smoke" });
    expect(test.status).toBe(201);

    const steps = await request(app)
      .put(`/api/tests/${test.body.id}/steps`)
      .send({
        steps: [
          { type: "navigate", config: { url: "/" } },
          {
            type: "assert",
            config: { assertion: "urlContains", expected: "example" },
          },
        ],
      });
    expect(steps.status).toBe(200);
    expect(steps.body.steps.length).toBe(2);
  });

  it("AUTH_DISABLED allows unauthenticated project list in local mode", async () => {
    expect(AUTH_DISABLED).toBe(true);
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
