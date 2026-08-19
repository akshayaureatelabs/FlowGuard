"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getAdminKey, setAdminKey } from "@/lib/api";

type Tab = "overview" | "projects" | "tests" | "runs" | "schedules" | "teams" | "users";
type View = "simple" | "advanced";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "tests", label: "Tests" },
  { id: "runs", label: "Runs" },
  { id: "schedules", label: "Schedules" },
  { id: "teams", label: "Teams" },
  { id: "users", label: "Users" },
];

const VIEW_KEY = "fg_admin_view";

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString();
}

function cronToHuman(cron?: string): string {
  if (!cron) return "";
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 5) {
    const [min, hour, dom, mon, dow] = parts;
    if (min === "0" && hour === "*" && dom === "*" && mon === "*" && (dow === "*" || dow === "?")) {
      return "every hour";
    }
    if (/^\*\/1$/.test(min)) return "every minute";
    if (/^\*\/30$/.test(min)) return "every 30 minutes";
    if (/^\*\/\d+$/.test(min)) return `every ${min.replace("* /", "").replace("*/", "")} minutes`;
    if (min === "0" && /^\*\/\d+$/.test(hour)) {
      return `every ${hour.replace("*/", "")} hours`;
    }
    if (min === "0" && /^\d+$/.test(hour)) {
      const h = Number(hour);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      if (dow === "*") return `every day at ${h12}:00 ${ampm}`;
      if (dow === "1-5") return `weekdays at ${h12}:00 ${ampm}`;
      const dayNames: Record<string, string> = {
        "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
        "4": "Thursday", "5": "Friday", "6": "Saturday", "7": "Sunday",
      };
      if (dayNames[dow]) return `${dayNames[dow]}s at ${h12}:00 ${ampm}`;
    }
  }
  return `custom (${cron})`;
}

function friendlyStatus(s?: string): string {
  switch (s) {
    case "queued": return "Waiting";
    case "running": return "Running now";
    case "passed": return "Passed";
    case "failed": return "Failed";
    case "error": return "Error";
    default: return s || "—";
  }
}

function statusBadge(status?: string) {
  if (!status) return <span className="badge" style={{ display: "inline-flex" }}>—</span>;
  const cls =
    status === "passed"
      ? "badge-pass"
      : status === "failed" || status === "error"
      ? "badge-fail"
      : "badge-run";
  return (
    <span className={`badge ${cls}`} style={{ display: "inline-flex" }}>
      {friendlyStatus(status)}
    </span>
  );
}

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString() : "—";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [view, setView] = useState<View>("simple");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (tab: Tab) => {
    setError("");
    setLoading(true);
    try {
      const fn =
        tab === "overview"
          ? api.admin.overview
          : tab === "projects"
          ? api.admin.projects
          : tab === "tests"
          ? api.admin.tests
          : tab === "runs"
          ? api.admin.runs
          : tab === "schedules"
          ? api.admin.schedules
          : tab === "teams"
          ? api.admin.teams
          : api.admin.users;
      const res = await fn();
      setData((d: any) => ({ ...d, [tab]: res }));
    } catch (e: any) {
      setError(e.message === "Invalid admin key" ? "Invalid admin key" : e.message);
      if (e.message === "Invalid admin key") setKeySaved(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setView((typeof window !== "undefined" && (localStorage.getItem(VIEW_KEY) as View)) || "simple");
    } catch { /* ignore */ }
    if (getAdminKey()) {
      setKeySaved(true);
      if (!data.overview) load("overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch { /* ignore */ }
    if (v === "simple" && !data.overview) load("overview");
    if (v === "advanced" && activeTab !== "overview" && !(activeTab in data)) load(activeTab);
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (!(tab in data)) load(tab);
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    setAdminKey(key.trim());
    setKeySaved(true);
    setError("");
    await load("overview");
  };

  const del = async (kind: string, id: string, label: string, reload: Tab) => {
    const friendly = {
      project: `project "${label}" and everything inside it`,
      test: `test "${label}"`,
      run: `this run result`,
      schedule: `this auto-run schedule`,
      team: `team "${label}"`,
      user: `this user account`,
    }[kind];
    if (!confirm(`Delete ${friendly}? This cannot be undone.`)) return;
    try {
      const fn =
        kind === "project"
          ? api.admin.deleteProject
          : kind === "test"
          ? api.admin.deleteTest
          : kind === "run"
          ? api.admin.deleteRun
          : kind === "schedule"
          ? api.admin.deleteSchedule
          : kind === "team"
          ? api.admin.deleteTeam
          : api.admin.deleteUser;
      await fn(id);
      if (reload === "overview") {
        setData((d: any) => ({ ...d, overview: undefined }));
        await load("overview");
        return;
      }
      await load(reload);
      const other = reload === "projects" ? "tests" : reload === "tests" ? "runs" : reload;
      if (kind === "test") setData((d: any) => ({ ...d, runs: undefined }));
      if (kind !== reload && reload === "tests") setData((d: any) => ({ ...d, overview: undefined }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const runTest = async (t: any) => {
    const env = t.environments?.[0];
    if (!env) {
      setError("No website configured for this test. Add one in the test settings first.");
      return;
    }
    if (!confirm(`Run "${t.name}" on "${env.name}" now?`)) return;
    setError("");
    try {
      await api.admin.runTest(t.id, env.id);
      setData((d: any) => ({ ...d, runs: undefined, overview: undefined }));
      setActiveTab("runs");
      await load("runs");
      alert("Run started — you'll see the result in Runs.");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const o = data.overview;
  const counts = o?.counts || {};
  const health = o ? computeHealth(o) : null;

  return (
    <div>
      <div className="page-header">
        <h1>Admin</h1>
        <p>
          A quick look at how everything is doing — or switch to advanced to manage
          every project, test, run, team, and user.
        </p>
      </div>

      {!keySaved ? (
        <div className="panel-box" style={{ maxWidth: 420 }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Admin key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="Enter the ADMIN_KEY for this instance"
              style={{ width: "100%" }}
            />
          </div>
          {error && <div className="alert-error">{error}</div>}
          <button className="btn" onClick={saveKey} style={{ width: "100%" }}>
            Connect
          </button>
          <p className="muted" style={{ marginTop: 10 }}>
            The admin key is set via the <code>ADMIN_KEY</code> environment variable on the API.
          </p>
        </div>
      ) : (
        <>
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button
              className={view === "simple" ? "active" : ""}
              onClick={() => switchView("simple")}
              style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
            >
              Simple dashboard
            </button>
            <button
              className={view === "advanced" ? "active" : ""}
              onClick={() => switchView("advanced")}
              style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
            >
              Advanced (full control)
            </button>
            <button
              style={{ marginLeft: "auto", borderColor: "var(--border)" }}
              onClick={() => {
                if (confirm("Disconnect admin key?")) {
                  setAdminKey("");
                  setKeySaved(false);
                  setData({});
                }
              }}
            >
              Disconnect
            </button>
          </div>

          {error && <div className="alert-error">{error}</div>}
          {loading && <p className="muted">Loading…</p>}

          {view === "simple" ? (
            o && <SimpleDashboard o={o} goAdvanced={switchView} onRefresh={() => { setData((d: any) => ({ ...d, overview: undefined })); load("overview"); }} />
          ) : (
            <AdvancedView
              activeTab={activeTab}
              switchTab={switchTab}
              data={data}
              o={o}
              counts={counts}
              health={health}
              runTest={runTest}
              del={del}
              load={load}
            />
          )}
        </>
      )}
    </div>
  );
}

type Attention = { level: "bad" | "warn" | "good"; text: string };

function computeHealth(o: any): { level: "good" | "warn" | "bad"; items: Attention[] } {
  const items: Attention[] = [];
  const { passRate, stuckRuns, failingTests, scheduler, alerts } = o;
  if (passRate != null && passRate < 50) {
    items.push({ level: "bad", text: `Pass rate is only ${passRate}% — many tests are failing.` });
  } else if (passRate != null && passRate < 80) {
    items.push({ level: "warn", text: `Pass rate is ${passRate}% — worth keeping an eye on.` });
  }
  if (passRate == null && o.finishedRuns === 0 && o.counts?.tests > 0) {
    items.push({ level: "warn", text: "Tests exist but none have run yet." });
  }
  if (failingTests?.length) {
    items.push({
      level: "warn",
      text: `${failingTests.length} test${failingTests.length > 1 ? "s" : ""} failing: ${failingTests
        .slice(0, 3)
        .map((f: any) => `"${f.name}"`)
        .join(", ")}${failingTests.length > 3 ? "…" : ""}`,
    });
  }
  if (stuckRuns?.length) {
    items.push({ level: "bad", text: `${stuckRuns.length} run${stuckRuns.length > 1 ? "s" : ""} seem stuck and may need attention.` });
  }
  if (scheduler?.overdue > 0) {
    items.push({ level: "bad", text: `${scheduler.overdue} scheduled auto-run${scheduler.overdue > 1 ? "s are" : " is"} overdue.` });
  }
  if (alerts?.failures > 0) {
    items.push({ level: "bad", text: `${alerts.failures} notification${alerts.failures > 1 ? "s" : ""} could not be delivered.` });
  }
  const level: "good" | "warn" | "bad" = items.some((i) => i.level === "bad")
    ? "bad"
    : items.some((i) => i.level === "warn")
    ? "warn"
    : "good";
  return { level, items };
}

function HealthBanner({ o }: { o: any }) {
  const { level, items } = computeHealth(o);
  const color =
    level === "good" ? "var(--success)" : level === "warn" ? "var(--accent)" : "var(--danger)";
  const bg =
    level === "good"
      ? "var(--success-soft)"
      : level === "warn"
      ? "var(--accent-soft)"
      : "var(--danger-soft)";
  const headline =
    level === "good"
      ? "All good — everything is running smoothly."
      : level === "warn"
      ? "Mostly fine, but a few things could use a look."
      : "Action needed — a few things are not OK.";
  return (
    <div
      className="panel-box"
      style={{ borderColor: color, background: bg, borderStyle: "solid", borderWidth: 1 }}
    >
      <div style={{ fontSize: "1.15rem", fontWeight: 700, color, marginBottom: 4 }}>
        {level === "good" ? "🟢" : level === "warn" ? "🟡" : "🔴"} {headline}
      </div>
      {items.length ? (
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", color: "var(--text)" }}>
          {items.map((i, n) => (
            <li key={n} style={{ marginBottom: 2 }}>
              {i.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ marginBottom: 0 }}>
          Nothing needs attention right now.
        </p>
      )}
    </div>
  );
}

function TrendChart({ trend7d }: { trend7d: any[] }) {
  const max = Math.max(1, ...trend7d.map((d) => d.runs));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, padding: "0 4px" }}>
      {trend7d.map((d) => {
        const passedH = Math.round((d.passed / max) * 90);
        const failedH = Math.round((d.failed / max) * 90);
        const total = passedH + failedH;
        const label = new Date(d.date).toLocaleDateString(undefined, { weekday: "short" });
        return (
          <div key={d.date} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                height: 92,
                gap: 1,
              }}
            >
              <div
                style={{
                  height: failedH || 0,
                  backgroundColor: "var(--danger)",
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.9,
                }}
                title={`${d.failed} failed`}
              />
              <div
                style={{
                  height: total ? passedH : 2,
                  backgroundColor: "var(--success)",
                  borderRadius: 2,
                }}
                title={`${d.passed} passed`}
              />
            </div>
            <div className="muted" style={{ fontSize: "0.62rem", marginTop: 4 }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleDashboard({ o, onRefresh, goAdvanced }: { o: any; onRefresh: () => void; goAdvanced: (v: View) => void }) {
  const c = o.counts || {};
  const passRateEl = o.passRate != null ? `${o.passRate}%` : "—";
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { v: passRateEl, l: "Tests passing" },
          { v: String(c.tests ?? 0), l: "Total tests" },
          { v: String(c.projects ?? 0), l: "Projects / websites" },
          { v: String(o.scheduler?.enabled ?? 0), l: "Auto-runs active" },
          { v: String(o.alerts?.attempts ?? 0), l: "Alerts sent" },
        ].map((m, i) => (
          <div className="metric-card" key={i}>
            <div className="metric-value">{m.v}</div>
            <div className="metric-label">{m.l}</div>
          </div>
        ))}
      </div>

      <HealthBanner o={o} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div className="panel-box" style={{ flex: "1 1 340px" }}>
          <h3 style={{ margin: "0 0 10px" }}>Activity — last 7 days</h3>
          {o.trend7d?.length ? <TrendChart trend7d={o.trend7d} /> : <p className="muted">No runs yet.</p>}
        </div>

        <div className="panel-box" style={{ flex: "1 1 300px" }}>
          <h3 style={{ margin: "0 0 10px" }}>Needs attention</h3>
          {computeHealth(o).items.length ? (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--text)" }}>
              {computeHealth(o).items.map((i, n) => (
                <li key={n} style={{ marginBottom: 6 }}>{i.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing needs attention right now.</p>
          )}
        </div>
      </div>

      <div className="panel-box" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 10px" }}>
          Recent test activity{" "}
          <span style={{ fontWeight: 400 }}>
            <button className="btn btn-ghost btn-sm" onClick={onRefresh} style={{ marginLeft: 8 }}>
              Refresh
            </button>{" "}
            <button className="btn btn-ghost btn-sm" onClick={() => goAdvanced("advanced")}>
              View all runs
            </button>
          </span>
        </h3>
        {o.recentRuns?.length ? (
          <div style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Website</th>
                  <th>Result</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {o.recentRuns.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.testName || r.testId.slice(0, 8)}</td>
                    <td className="muted">{r.projectName || "—"}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{timeAgo(r.finishedAt || r.startedAt || r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No runs yet — start your first test from a project.</p>
        )}
      </div>

      <details className="panel-box" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>System details (technical)</summary>
        <table className="table" style={{ marginTop: 8 }}>
          <tbody>
            <tr><td className="muted">API uptime</td><td>{o.metrics?.uptimeSec ?? 0} seconds</td></tr>
            <tr><td className="muted">API requests</td><td>{o.metrics?.requestsTotal ?? 0}</td></tr>
            <tr><td className="muted">Runs started / finished</td><td>{o.metrics?.runsStarted ?? 0} / {o.metrics?.runsFinished ?? 0}</td></tr>
            <tr><td className="muted">Enabled auto-runs</td><td>{o.scheduler?.enabled ?? 0} of {o.scheduler?.total ?? 0}</td></tr>
            <tr><td className="muted">Overdue auto-runs</td><td>{o.scheduler?.overdue ?? 0}</td></tr>
            <tr><td className="muted">Alerts &amp; notifications</td><td>{o.alerts?.attempts ?? 0} sent, {o.alerts?.failures ?? 0} failed{ o.alerts?.lastAt ? ` · last ${timeAgo(o.alerts.lastAt)}` : ""}</td></tr>
            <tr><td className="muted">Stuck runs</td><td>{o.stuckRuns?.length ?? 0}</td></tr>
          </tbody>
        </table>
      </details>
    </>
  );
}

function AdvancedView({
  activeTab, switchTab, data, o, counts, health, runTest, del, load,
}: {
  activeTab: Tab;
  switchTab: (t: Tab) => void;
  data: any;
  o: any;
  counts: any;
  health: any;
  runTest: (t: any) => void;
  del: (kind: string, id: string, label: string, reload: Tab) => void;
  load: (t: Tab) => void;
}) {
  const metrics = o?.metrics || {};
  void health;
  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={activeTab === t.id ? "active" : ""} onClick={() => switchTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && o && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              ["Projects", counts.projects ?? 0],
              ["Tests", counts.tests ?? 0],
              ["Runs", counts.runs ?? 0],
              ["Schedules", counts.schedules ?? 0],
              ["Teams", counts.teams ?? 0],
              ["Users", counts.users ?? 0],
            ].map(([l, v], i) => (
              <div className="metric-card" key={i}>
                <div className="metric-value">{v}</div>
                <div className="metric-label">{l}</div>
              </div>
            ))}
            <div className="metric-card"><div className="metric-value">{metrics.uptimeSec ?? 0}s</div><div className="metric-label">API uptime</div></div>
            <div className="metric-card"><div className="metric-value">{metrics.requestsTotal ?? 0}</div><div className="metric-label">API requests</div></div>
          </div>
          <h3 style={{ marginBottom: 10 }}>Recent runs</h3>
          <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr><th>Test</th><th>Project</th><th>Status</th><th>Started</th><th>Duration</th><th></th></tr>
              </thead>
              <tbody>
                {o.recentRuns?.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.testName || r.testId.slice(0, 8)}</td>
                    <td className="muted">{r.projectName || "—"}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{fmt(r.startedAt || r.createdAt)}</td>
                    <td>{r.finishedAt && r.startedAt ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s` : "—"}</td>
                    <td className="cell-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => del("run", r.id, r.id.slice(0, 8), "overview")}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "projects" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Owner</th><th>Team</th><th className="cell-num">Envs</th><th className="cell-num">Tests</th><th className="cell-num">Runs</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {(data.projects || []).map((p: any) => (
                <tr key={p.id}>
                  <td><a href={`/projects/${p.id}`}>{p.name}</a></td>
                  <td className="muted">{p.ownerId || "—"}</td>
                  <td className="muted">{p.teamId ? p.teamId.slice(0, 8) : "—"}</td>
                  <td className="cell-num">{p.environmentCount}</td>
                  <td className="cell-num">{p.testCount}</td>
                  <td className="cell-num">{p.runCount}</td>
                  <td>{fmt(p.createdAt)}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del("project", p.id, p.name, "projects")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "tests" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Project</th><th className="cell-num">Steps</th><th className="cell-num">Schedules</th><th className="cell-num">Runs</th><th>Last status</th><th>Last run</th><th></th></tr>
            </thead>
            <tbody>
              {(data.tests || []).map((t: any) => (
                <tr key={t.id}>
                  <td><a href={`/tests/${t.id}`}>{t.name}</a></td>
                  <td className="muted">{t.projectName || "—"}</td>
                  <td className="cell-num">{t.stepCount}</td>
                  <td className="cell-num">{t.scheduleCount}</td>
                  <td className="cell-num">{t.runCount}</td>
                  <td>{statusBadge(t.lastStatus)}</td>
                  <td>{timeAgo(t.lastRunAt)}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => runTest(t)} disabled={!t.environments?.length}>Run</button>{" "}
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del("test", t.id, t.name, "tests")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "runs" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Test</th><th>Project</th><th>Status</th><th>Started</th><th>Finished</th><th>Error</th><th></th></tr>
            </thead>
            <tbody>
              {(data.runs || []).map((r: any) => (
                <tr key={r.id}>
                  <td><a href={`/tests/${r.testId}`}>{r.testName || r.testId.slice(0, 8)}</a></td>
                  <td className="muted">{r.projectName || "—"}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td>{timeAgo(r.startedAt || r.createdAt)}</td>
                  <td>{timeAgo(r.finishedAt)}</td>
                  <td className="muted" style={{ maxWidth: 260 }}>{r.error ? <span style={{ color: "var(--danger)" }}>{String(r.error).slice(0, 120)}</span> : "—"}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del("run", r.id, r.id.slice(0, 8), "runs")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "schedules" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Test</th><th>Project</th><th>Schedule</th><th>Enabled</th><th>Last status</th><th className="cell-num">Runs</th><th>Next run</th><th>Last error</th><th></th></tr>
            </thead>
            <tbody>
              {(data.schedules || []).map((s: any) => (
                <tr key={s.id}>
                  <td><a href={`/tests/${s.testId}`}>{s.testName || s.testId.slice(0, 8)}</a></td>
                  <td className="muted">{s.projectName || "—"}</td>
                  <td>{s.cron ? cronToHuman(s.cron) : `every ${s.intervalMinutes || 60} min`}</td>
                  <td>{s.enabled ? "✓" : "✗"}</td>
                  <td>{statusBadge(s.lastRunStatus)}</td>
                  <td className="cell-num">{s.runsCount ?? 0}</td>
                  <td>{timeAgo(s.nextRunAt)}</td>
                  <td className="muted" style={{ maxWidth: 200 }}>{s.lastError ? <span style={{ color: "var(--danger)" }}>{String(s.lastError).slice(0, 100)}</span> : "—"}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del("schedule", s.id, s.id.slice(0, 8), "schedules")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Owner</th><th className="cell-num">Members</th><th className="cell-num">Invites</th><th className="cell-num">Projects</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {(data.teams || []).map((t: any) => (
                <tr key={t.id}>
                  <td><a href="/teams">{t.name}</a></td>
                  <td className="muted">{t.createdBy || "—"}</td>
                  <td className="cell-num">{t.memberCount}</td>
                  <td className="cell-num">{t.inviteCount}</td>
                  <td className="cell-num">{t.projectCount}</td>
                  <td>{fmt(t.createdAt)}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del("team", t.id, t.name, "teams")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "users" && (
        <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Email</th><th>Name</th><th>API key</th><th>ID</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {(data.users || []).map((u: any) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td className="muted">{u.name || "—"}</td>
                  <td><code>{u.apiKey ? u.apiKey : "—"}</code></td>
                  <td className="muted">{u.id.slice(0, 8)}</td>
                  <td>{fmt(u.createdAt)}</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={u.id === "local"} onClick={() => del("user", u.id, u.email, "users")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}