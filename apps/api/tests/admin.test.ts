import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { adminRouter, requireAdminKey, assertAdminKeyConfigured } from "../src/admin.js";
import { store } from "../src/store.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", requireAdminKey, adminRouter);
  return app;
}

describe("admin router", () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
    const p = store.createProject("AdminTest Project", "owner-a");
    store.createTeam("AdminTest Team", "owner-a");
    store.createTeam("AdminTest Team 2", "owner-b");
    const t = store.createTest(p.id, "AdminTest Test");
    const env = store.createEnvironment(p.id, "Env A", "https://example.com");
    const run = store.createRun(t.id, env.id);
    store.updateRun(run.id, { status: "passed" });
  });

  it("rejects requests without an admin key", async () => {
    const res = await request(app).get("/api/admin/config");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid admin key");
  });

  it("rejects requests with a wrong admin key", async () => {
    const res = await request(app)
      .get("/api/admin/config")
      .set("x-admin-key", "wrong-key");
    expect(res.status).toBe(401);
  });

  it("returns config with a valid key", async () => {
    const res = await request(app)
      .get("/api/admin/config")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authDisabled: true, database: "memory" });
    expect(res.body).toHaveProperty("metrics.uptimeSec");
  });

  it("returns overview counts across all stores", async () => {
    const res = await request(app)
      .get("/api/admin/overview")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    expect(res.body.counts.projects).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.teams).toBeGreaterThanOrEqual(2);
    expect(res.body.counts.tests).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.recentRuns)).toBe(true);
  });

  it("lists projects with environment/test/run counts", async () => {
    const res = await request(app)
      .get("/api/admin/projects")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("total");
    const p = res.body.items.find((x: any) => x.name === "AdminTest Project");
    expect(p).toBeDefined();
    expect(p.environmentCount).toBe(1);
    expect(p.testCount).toBe(1);
  });

  it("lists teams with member counts", async () => {
    const res = await request(app)
      .get("/api/admin/teams")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    const names = res.body.items.map((t: any) => t.name);
    expect(names).toContain("AdminTest Team");
    expect(names).toContain("AdminTest Team 2");
    expect(res.body.items.every((t: any) => typeof t.memberCount === "number")).toBe(true);
  });

  it("paginates admin lists with limit/offset and total", async () => {
    const res = await request(app)
      .get("/api/admin/projects?limit=1&offset=0")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);

    const runs = await request(app)
      .get("/api/admin/runs?limit=5")
      .set("x-admin-key", "flowguard-admin");
    expect(runs.status).toBe(200);
    expect(runs.body.items.length).toBeGreaterThanOrEqual(1);
    expect(runs.body.total).toBeGreaterThanOrEqual(1);
    expect(runs.body.items[0]).toHaveProperty("testName");
  });

  it("caps admin pagination limit at 200", async () => {
    const res = await request(app)
      .get("/api/admin/users?limit=9999")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  describe("assertAdminKeyConfigured", () => {
    const origNodeEnv = process.env.NODE_ENV;

    afterAll(() => {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ADMIN_KEY = "";
    });

    it("refuses to start in production without ADMIN_KEY", () => {
      process.env.NODE_ENV = "production";
      process.env.ADMIN_KEY = "";
      expect(assertAdminKeyConfigured).toThrow(/ADMIN_KEY/);
    });

    it("refuses the default admin key in production", () => {
      process.env.NODE_ENV = "production";
      process.env.ADMIN_KEY = "flowguard-admin";
      expect(assertAdminKeyConfigured).toThrow(/ADMIN_KEY/);
    });

    it("allows a strong ADMIN_KEY in production", () => {
      process.env.NODE_ENV = "production";
      process.env.ADMIN_KEY = "s3cr3t-custom-value";
      expect(() => assertAdminKeyConfigured()).not.toThrow();
    });

    it("does not block dev when ADMIN_KEY unset", () => {
      process.env.NODE_ENV = "test";
      process.env.ADMIN_KEY = "";
      expect(() => assertAdminKeyConfigured()).not.toThrow();
    });
  });

  it("returns 404 for missing deletes", async () => {
    const res = await request(app)
      .delete("/api/admin/runs/does-not-exist")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(404);
  });

  it("blocks deleting the local user", async () => {
    const res = await request(app)
      .delete("/api/admin/users/local")
      .set("x-admin-key", "flowguard-admin");
    expect(res.status).toBe(400);
  });

  it("refuses a run trigger without testId/environmentId", async () => {
    const res = await request(app)
      .post("/api/admin/run")
      .set("x-admin-key", "flowguard-admin")
      .send({ testId: "x" });
    expect(res.status).toBe(400);
  });
});