// Mongo integration smoke for CI.
// Requires: a running FlowGuard API pointed at a Mongo database (USE_DATABASE=mongo).
// Exercises the real Mongo store path over HTTP: health, CRUD, run lifecycle,
// paginated admin lists, admin-key gate, and admin run trigger.
const base = process.env.API_URL || "http://localhost:3001";
const adminKey = process.env.ADMIN_KEY || "";

let failures = 0;

function check(name, ok, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Health — must report the Mongo backend.
  const health = await api("GET", "/health");
  check("health ok", health.status === 200 && health.data?.status === "ok", JSON.stringify(health.data?.database));
  check("database is mongo", health.data?.database === "mongo", String(health.data?.database));

  // Admin gate — no key is rejected.
  const noKey = await api("GET", "/api/admin/overview");
  check("admin 401 without key", noKey.status === 401);

  // Create a project, environment, test.
  const suffix = Math.random().toString(36).slice(2, 8);
  const proj = await api("POST", "/api/projects", { name: `ci-mongo-${suffix}` });
  check("create project", proj.status === 200 || proj.status === 201, String(proj.status));
  const projectId = proj.data?.id;
  if (!projectId) throw new Error("no project id");

  const env = await api("POST", `/api/projects/${projectId}/environments`, {
    name: "CI Env",
    baseUrl: "https://example.com",
  });
  check("create environment", env.status === 200 || env.status === 201, String(env.status));

  const test = await api("POST", `/api/projects/${projectId}/tests`, { name: "ci-mongo test" });
  check("create test", test.status === 200 || test.status === 201, String(test.status));
  const testId = test.data?.id;
  if (!testId) throw new Error("no test id");

  // Trigger a run via admin (local runner will attempt Playwright; no browser in CI
  // means it lands on a terminal status: passed/failed/error).
  const run = await api(
    "POST",
    "/api/admin/run",
    { testId, environmentId: env.data.id },
    { "x-admin-key": adminKey }
  );
  check("admin run trigger", (run.status === 200 || run.status === 201) && !!run.data?.id, String(run.status));
  const runId = run.data?.id;

  if (runId) {
    let status = null;
    for (let i = 0; i < 30; i++) {
      const r = await api("GET", `/api/runs/${runId}`);
      status = r.data?.status;
      if (status && ["passed", "failed", "error"].includes(status)) break;
      await sleep(2000);
    }
    check("run reaches terminal status", ["passed", "failed", "error"].includes(status), String(status));
  }

  // Persistence across API restarts is the point of Mongo: verify list endpoints
  // surface the created rows and overview counts include them.
  const projects = await api("GET", "/api/projects");
  check("project persisted in Mongo", projects.data?.some((p) => p.id === projectId));

  // Paginated admin lists.
  const [adminProj, adminRuns, overview] = await Promise.all([
    api("GET", "/api/admin/projects?limit=3&offset=0", undefined, { "x-admin-key": adminKey }),
    api("GET", "/api/admin/runs?limit=3&offset=0", undefined, { "x-admin-key": adminKey }),
    api("GET", "/api/admin/overview", undefined, { "x-admin-key": adminKey }),
  ]);
  check("admin projects paginated", Array.isArray(adminProj.data?.items) && adminProj.data?.total > 0);
  check("admin runs paginated", Array.isArray(adminRuns.data?.items) && adminRuns.data?.total > 0);
  check("admin overview counts", overview.data?.counts?.projects >= 1 && overview.data?.counts?.tests >= 1);
  check("admin overview trend7d", Array.isArray(overview.data?.trend7d) && overview.data?.trend7d.length === 7);

  // Cleanup via admin delete.
  const del = await api("DELETE", `/api/admin/projects/${projectId}`, undefined, {
    "x-admin-key": adminKey,
  });
  check("admin delete project (204/200)", del.status === 204 || del.status === 200, String(del.status));
  const gone = await api("GET", "/api/projects");
  check("project removed", !gone.data?.some((p) => p.id === projectId));

  if (process.env.MONGODB_URL) {
    console.log(`\nUsed MONGODB_URL (has password?) ${/:\/\/.+@/.test(process.env.MONGODB_URL) ? "yes" : "no"}`);
  }

  console.log(failures === 0 ? "\nALL MONGOSMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("mongo-smoke error:", err);
  process.exit(1);
});