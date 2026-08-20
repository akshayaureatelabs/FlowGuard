#!/usr/bin/env node
/**
 * Post-deploy smoke against a live API.
 *
 *   API_URL=https://api.example.com ADMIN_KEY=... node scripts/post-deploy-smoke.mjs
 *
 * Optional: SMOKE_EMAIL / SMOKE_PASSWORD for auth register+login when AUTH is on.
 */

const API = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const email = process.env.SMOKE_EMAIL || `smoke-${Date.now()}@flowguard.test`;
const password = process.env.SMOKE_PASSWORD || "SmokeTest!234";

let failed = 0;

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`FlowGuard post-deploy smoke → ${API}\n`);

  const health = await req("/health");
  ok("GET /health", health.status === 200, JSON.stringify(health.body));
  ok("database not memory (prefer mongo)", health.body?.database && health.body.database !== "memory", String(health.body?.database));

  if (ADMIN_KEY) {
    const overview = await req("/api/admin/overview", {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    ok("admin overview", overview.status === 200, `counts=${JSON.stringify(overview.body?.counts || {})}`);
    const bad = await req("/api/admin/overview", {
      headers: { "x-admin-key": "wrong-key" },
    });
    ok("admin rejects bad key", bad.status === 401);
  } else {
    console.log("  · skip admin checks (set ADMIN_KEY)");
  }

  // Auth path: register (or login if exists)
  let token = null;
  const reg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Smoke" }),
  });
  if (reg.status === 201 && reg.body?.token) {
    token = reg.body.token;
    ok("register", true, email);
  } else {
    const login = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (login.status === 200 && login.body?.token) {
      token = login.body.token;
      ok("login", true, email);
    } else if (health.body?.auth === "disabled") {
      ok("auth disabled (local-style) — skip token", true);
    } else {
      ok("register/login", false, JSON.stringify(reg.body || login.body));
    }
  }

  const authH = token ? { Authorization: `Bearer ${token}` } : {};

  const proj = await req("/api/projects", {
    method: "POST",
    headers: authH,
    body: JSON.stringify({ name: `Smoke ${Date.now()}` }),
  });
  ok("create project", proj.status === 201, proj.body?.id);
  const projectId = proj.body?.id;

  if (projectId) {
    const env = await req(`/api/projects/${projectId}/environments`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ name: "prod", baseUrl: "https://example.com" }),
    });
    ok("create environment", env.status === 201, env.body?.id);

    const test = await req(`/api/projects/${projectId}/tests`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ name: "Smoke navigate" }),
    });
    ok("create test", test.status === 201, test.body?.id);

    if (test.body?.id) {
      const steps = await req(`/api/tests/${test.body.id}/steps`, {
        method: "PUT",
        headers: authH,
        body: JSON.stringify({
          steps: [
            {
              id: crypto.randomUUID(),
              type: "navigate",
              config: { url: "https://example.com" },
              optional: false,
              timeoutMs: 15000,
            },
            {
              id: crypto.randomUUID(),
              type: "assert",
              config: { assertion: "urlContains", expected: "example.com" },
              optional: false,
              timeoutMs: 5000,
            },
          ],
        }),
      });
      ok("update steps", steps.status === 200);

      if (env.body?.id) {
        const run = await req(`/api/tests/${test.body.id}/runs`, {
          method: "POST",
          headers: authH,
          body: JSON.stringify({ environmentId: env.body.id }),
        });
        ok("start run", run.status === 201, run.body?.id);

        if (run.body?.id) {
          let final = null;
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const g = await req(`/api/runs/${run.body.id}`, { headers: authH });
            if (g.body?.status && g.body.status !== "running" && g.body.status !== "queued") {
              final = g.body;
              break;
            }
          }
          ok(
            "run finished",
            !!final && (final.status === "passed" || final.status === "failed" || final.status === "error"),
            final ? final.status : "timeout"
          );
        }
      }
    }

    // cleanup best-effort
    await req(`/api/projects/${projectId}`, { method: "DELETE", headers: authH });
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll smoke checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
