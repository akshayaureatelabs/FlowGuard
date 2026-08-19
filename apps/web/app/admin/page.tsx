"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getAdminKey, setAdminKey } from "@/lib/api";

type Tab = "overview" | "projects" | "tests" | "runs" | "schedules" | "teams" | "users";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "tests", label: "Tests" },
  { id: "runs", label: "Runs" },
  { id: "schedules", label: "Schedules" },
  { id: "teams", label: "Teams" },
  { id: "users", label: "Users" },
];

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

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
      {status}
    </span>
  );
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
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

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (!(tab in data)) load(tab);
  };

  useEffect(() => {
    if (getAdminKey()) {
      setKeySaved(true);
      load("overview");
    }
  }, [load]);

  const saveKey = async () => {
    if (!key.trim()) return;
    setAdminKey(key.trim());
    setKeySaved(true);
    setError("");
    await load(activeTab);
  };

  const del = async (kind: string, id: string, label: string, reload: Tab) => {
    if (!confirm(`Delete ${kind} "${label}"? This cannot be undone.`)) return;
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
      await load(reload);
      if (reload === "overview") {
        setData((d: any) => ({ ...d, overview: undefined }));
        load("overview");
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const runTest = async (t: any) => {
    const env = t.environments?.[0];
    if (!env) {
      setError("No environment configured for this test. Add one in the test settings first.");
      return;
    }
    if (!confirm(`Run "${t.name}" against environment "${env.name}"?`)) return;
    setError("");
    try {
      const run = await api.admin.runTest(t.id, env.id);
      setData((d: any) => ({ ...d, runs: undefined }));
      setActiveTab("runs");
      load("runs");
      alert(`Run started: ${run.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const o = data.overview;
  const counts = o?.counts || {};
  const metrics = o?.metrics || {};

  return (
    <div>
      <div className="page-header">
        <h1>Admin</h1>
        <p>
          Full control over every project, test, run, schedule, team, and user
          across the FlowGuard instance.
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
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={activeTab === t.id ? "active" : ""}
                onClick={() => switchTab(t.id)}
              >
                {t.label}
              </button>
            ))}
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

          {activeTab === "overview" && o && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                <div className="metric-card">
                  <div className="metric-value">{counts.projects ?? 0}</div>
                  <div className="metric-label">Projects</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{counts.tests ?? 0}</div>
                  <div className="metric-label">Tests</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{counts.runs ?? 0}</div>
                  <div className="metric-label">Runs</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{counts.schedules ?? 0}</div>
                  <div className="metric-label">Schedules</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{counts.teams ?? 0}</div>
                  <div className="metric-label">Teams</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{counts.users ?? 0}</div>
                  <div className="metric-label">Users</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{metrics.uptimeSec ?? 0}s</div>
                  <div className="metric-label">API uptime</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{metrics.requestsTotal ?? 0}</div>
                  <div className="metric-label">API requests</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">
                    {(metrics.runsStarted ?? 0) - (metrics.runsFinished ?? 0)}
                  </div>
                  <div className="metric-label">Runs in flight</div>
                </div>
              </div>

              <h3 style={{ marginBottom: 10 }}>Recent runs</h3>
              {o.recentRuns?.length ? (
                <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Duration</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.recentRuns.map((r: any) => (
                        <tr key={r.id}>
                          <td>{r.testName || r.testId.slice(0, 8)}</td>
                          <td className="muted">{r.projectName || "—"}</td>
                          <td>{statusBadge(r.status)}</td>
                          <td>{fmt(r.startedAt || r.createdAt)}</td>
                          <td>
                            {r.finishedAt && r.startedAt
                              ? `${Math.round(
                                  (new Date(r.finishedAt).getTime() -
                                    new Date(r.startedAt).getTime()) /
                                    1000
                                )}s`
                              : "—"}
                          </td>
                          <td className="cell-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => del("run", r.id, r.id.slice(0, 8), "overview")}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No runs yet.</p>
              )}
            </>
          )}

          {activeTab === "projects" && (
            <div className="panel-box" style={{ padding: 0, overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Owner</th>
                    <th>Team</th>
                    <th className="cell-num">Envs</th>
                    <th className="cell-num">Tests</th>
                    <th className="cell-num">Runs</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.projects || []).map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <a href={`/projects/${p.id}`}>{p.name}</a>
                      </td>
                      <td className="muted">{p.ownerId || "—"}</td>
                      <td className="muted">{p.teamId ? p.teamId.slice(0, 8) : "—"}</td>
                      <td className="cell-num">{p.environmentCount}</td>
                      <td className="cell-num">{p.testCount}</td>
                      <td className="cell-num">{p.runCount}</td>
                      <td>{fmt(p.createdAt)}</td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => del("project", p.id, p.name, "projects")}
                        >
                          Delete
                        </button>
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
                  <tr>
                    <th>Name</th>
                    <th>Project</th>
                    <th className="cell-num">Steps</th>
                    <th className="cell-num">Schedules</th>
                    <th className="cell-num">Runs</th>
                    <th>Last status</th>
                    <th>Last run</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.tests || []).map((t: any) => (
                    <tr key={t.id}>
                      <td>
                        <a href={`/tests/${t.id}`}>{t.name}</a>
                      </td>
                      <td className="muted">{t.projectName || "—"}</td>
                      <td className="cell-num">{t.stepCount}</td>
                      <td className="cell-num">{t.scheduleCount}</td>
                      <td className="cell-num">{t.runCount}</td>
                      <td>{statusBadge(t.lastStatus)}</td>
                      <td>{fmt(t.lastRunAt)}</td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => runTest(t)}
                          disabled={!t.environments?.length}
                        >
                          Run
                        </button>{" "}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => del("test", t.id, t.name, "tests")}
                        >
                          Delete
                        </button>
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
                  <tr>
                    <th>Test</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Error</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.runs || []).map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <a href={`/tests/${r.testId}`}>{r.testName || r.testId.slice(0, 8)}</a>
                      </td>
                      <td className="muted">{r.projectName || "—"}</td>
                      <td>{statusBadge(r.status)}</td>
                      <td>{fmt(r.startedAt || r.createdAt)}</td>
                      <td>{fmt(r.finishedAt)}</td>
                      <td className="muted" style={{ maxWidth: 260 }}>
                        {r.error ? (
                          <span style={{ color: "var(--danger)" }}>
                            {String(r.error).slice(0, 120)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => del("run", r.id, r.id.slice(0, 8), "runs")}
                        >
                          Delete
                        </button>
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
                  <tr>
                    <th>Test</th>
                    <th>Project</th>
                    <th>Schedule</th>
                    <th>Enabled</th>
                    <th>Last status</th>
                    <th className="cell-num">Runs</th>
                    <th>Next run</th>
                    <th>Last error</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.schedules || []).map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <a href={`/tests/${s.testId}`}>{s.testName || s.testId.slice(0, 8)}</a>
                      </td>
                      <td className="muted">{s.projectName || "—"}</td>
                      <td>
                        {s.cron ? (
                          <code>{s.cron}</code>
                        ) : (
                          `every ${s.intervalMinutes || 60} min`
                        )}
                      </td>
                      <td>{s.enabled ? "✓" : "✗"}</td>
                      <td>{statusBadge(s.lastRunStatus)}</td>
                      <td className="cell-num">{s.runsCount ?? 0}</td>
                      <td>{fmt(s.nextRunAt)}</td>
                      <td className="muted" style={{ maxWidth: 200 }}>
                        {s.lastError ? (
                          <span style={{ color: "var(--danger)" }}>
                            {String(s.lastError).slice(0, 100)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => del("schedule", s.id, s.id.slice(0, 8), "schedules")}
                        >
                          Delete
                        </button>
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
                  <tr>
                    <th>Name</th>
                    <th>Owner</th>
                    <th className="cell-num">Members</th>
                    <th className="cell-num">Invites</th>
                    <th className="cell-num">Projects</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.teams || []).map((t: any) => (
                    <tr key={t.id}>
                      <td>
                        <a href="/teams">{t.name}</a>
                      </td>
                      <td className="muted">{t.createdBy || "—"}</td>
                      <td className="cell-num">{t.memberCount}</td>
                      <td className="cell-num">{t.inviteCount}</td>
                      <td className="cell-num">{t.projectCount}</td>
                      <td>{fmt(t.createdAt)}</td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => del("team", t.id, t.name, "teams")}
                        >
                          Delete
                        </button>
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
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>API key</th>
                    <th>ID</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.users || []).map((u: any) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td className="muted">{u.name || "—"}</td>
                      <td>
                        <code>{u.apiKey ? u.apiKey : "—"}</code>
                      </td>
                      <td className="muted">{u.id.slice(0, 8)}</td>
                      <td>{fmt(u.createdAt)}</td>
                      <td className="cell-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={u.id === "local"}
                          onClick={() => del("user", u.id, u.email, "users")}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}