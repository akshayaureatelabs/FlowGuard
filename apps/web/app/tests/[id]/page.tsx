"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, resolveArtifact } from "@/lib/api";
import StepEditor, { EditorStep } from "@/components/editor/StepEditor";
import { v4 as uuid } from "uuid";

const statusBadge = (status: string) =>
  status === "passed"
    ? "badge-pass"
    : status === "failed" || status === "error"
    ? "badge-fail"
    : "badge-run";

function fmtDuration(ms?: number) {
  if (ms == null) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default function TestEditorPage() {
  const params = useParams();
  const testId = params.id as string;

  const [test, setTest] = useState<any>(null);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [envs, setEnvs] = useState<any[]>([]);
  const [envId, setEnvId] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [browser, setBrowser] = useState("chrome");
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(720);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [intervalMin, setIntervalMin] = useState(60);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyWebhook, setNotifyWebhook] = useState("");
  const [importJson, setImportJson] = useState("");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, sch, runs] = await Promise.all([
        api.getTest(testId),
        api.listSchedules(testId),
        api.listRuns(testId),
      ]);
      setTest(t);
      setSteps(t.steps || []);
      setBrowser(t.settings?.browser || "chrome");
      setVw(t.settings?.viewport?.width || 1280);
      setVh(t.settings?.viewport?.height || 720);
      setSchedules(sch);
      setHistory(runs);
      if (!selectedRun && runs.length) setSelectedRun(runs[0]);
      const projectEnvs = await api.listEnvironments(t.projectId);
      setEnvs(projectEnvs);
      if (projectEnvs.length && !envId) setEnvId(projectEnvs[0].id);
    } catch (err: any) {
      setError(err.message);
    }
  }, [testId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      await api.updateTestSettings(testId, {
        browser,
        viewport: { width: vw, height: vh },
      });
      const updated = await api.updateSteps(testId, steps);
      setTest(updated);
      setMsg("Saved steps + settings");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const importSteps = (replace: boolean) => {
    try {
      setError("");
      const parsed = JSON.parse(importJson);
      const source = Array.isArray(parsed) ? parsed : parsed.steps;
      if (!Array.isArray(source)) throw new Error("JSON must be an array of steps");
      const normalized: EditorStep[] = source.map((s: any) => {
        if (!s?.type) throw new Error("Every step needs a type (e.g. click, type)");
        return {
          id: s.id || uuid(),
          type: s.type,
          name: s.name,
          optional: s.optional,
          config: s.config || {},
        };
      });
      const next = replace ? normalized : [...steps, ...normalized];
      setSteps(next);
      setImportJson("");
      setShowImport(false);
      setMsg(
        replace
          ? `Replaced steps with ${normalized.length} imported step(s)`
          : `Appended ${normalized.length} step(s) from recorder`
      );
    } catch (e: any) {
      setError(e.message || "Invalid JSON");
    }
  };

  const startRun = async () => {
    if (!envId) {
      setError("Select an environment first");
      return;
    }
    setRunning(true);
    setError("");
    try {
      await api.updateTestSettings(testId, {
        browser,
        viewport: { width: vw, height: vh },
      });
      await api.updateSteps(testId, steps);
      const r = await api.createRun(testId, envId);
      const poll = async () => {
        const latest = await api.getRun(r.id);
        setSelectedRun(latest);
        if (latest.status === "queued" || latest.status === "running") {
          setTimeout(poll, 1000);
        } else {
          setRunning(false);
          const runs = await api.listRuns(testId);
          setHistory(runs);
        }
      };
      setTimeout(poll, 800);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  };

  const addSchedule = async () => {
    if (!envId) {
      setError("Select an environment for the schedule");
      return;
    }
    try {
      setError("");
      await api.createSchedule({
        testId,
        environmentId: envId,
        intervalMinutes: intervalMin,
        notifyEmail: notifyEmail || undefined,
        notifyWebhook: notifyWebhook || undefined,
      });
      setMsg(`Schedule every ${intervalMin} min created`);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    try {
      setError("");
      await api.updateSchedule(id, { enabled: !enabled });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeSchedule = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      setError("");
      await api.deleteSchedule(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!test && !error) return <p className="muted">Loading…</p>;
  if (error && !test) return <div className="alert-error">{error}</div>;

  const stepMeta = new Map((test?.steps || []).map((s: any) => [s.id, s]));

  return (
    <div>
      <div className="page-header">
        <p className="muted" style={{ marginBottom: 6 }}>
          <a href={`/projects/${test?.projectId}`} style={{ color: "var(--muted)", textDecoration: "none" }}>
            ← Back to project
          </a>
        </p>
        <h1>{test?.name}</h1>
        <p>Codeless editor · settings · schedule · run · import recorder JSON</p>
      </div>

      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Environment</label>
            <select value={envId} onChange={(e) => setEnvId(e.target.value)}>
              <option value="">Select…</option>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.baseUrl})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Browser</label>
            <select value={browser} onChange={(e) => setBrowser(e.target.value)}>
              <option value="chrome">Chrome</option>
              <option value="firefox">Firefox</option>
            </select>
          </div>
          <div className="field">
            <label>Viewport W</label>
            <input type="number" value={vw} onChange={(e) => setVw(Number(e.target.value))} style={{ minWidth: 90 }} />
          </div>
          <div className="field">
            <label>Viewport H</label>
            <input type="number" value={vh} onChange={(e) => setVh(Number(e.target.value))} style={{ minWidth: 90 }} />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowImport((v) => !v)}>
                Import JSON
              </button>
              <button className="btn btn-ghost" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn" onClick={startRun} disabled={running || !envId}>
                {running ? "Running…" : "Run test"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showImport && (
        <div className="panel-box">
          <label>Paste FlowGuard recorder steps JSON</label>
          <textarea
            rows={8}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='[{ "type": "navigate", "config": { "url": "https://..." } }, ...]'
            style={{ width: "100%", fontFamily: "monospace", marginTop: 6 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => importSteps(false)}>
              Append steps
            </button>
            <button className="btn btn-ghost" onClick={() => importSteps(true)}>
              Replace all steps
            </button>
            <button className="btn btn-ghost" onClick={() => setShowImport(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <div className="alert-success">{msg}</div>}
      {error && <div className="alert-error">{error}</div>}

      <h2>Steps</h2>
      <StepEditor steps={steps} onChange={setSteps} />

      <h2>Schedule</h2>
      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Every (minutes)</label>
            <input
              type="number"
              min={1}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Notify email (optional)</label>
            <input
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="qa@company.com"
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Notify webhook (optional)</label>
            <input
              value={notifyWebhook}
              onChange={(e) => setNotifyWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={addSchedule}>
              Add schedule
            </button>
          </div>
        </div>
      </div>

      {schedules.length === 0 && <div className="empty">No schedules yet.</div>}
      {schedules.map((s) => (
        <div
          key={s.id}
          className="card"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <div>
            <strong>Every {s.intervalMinutes} min</strong>
            <div className="muted">
              {s.enabled ? "Enabled" : "Paused"}
              {s.notifyEmail && ` · ${s.notifyEmail}`}
              {s.notifyWebhook && " · webhook"}
              {s.nextRunAt && ` · next ${new Date(s.nextRunAt).toLocaleString()}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleSchedule(s.id, s.enabled)}>
              {s.enabled ? "Pause" : "Resume"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--danger)" }}
              onClick={() => removeSchedule(s.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {/* ── Run history ─────────────────────────────────── */}
      <div style={{ marginTop: "1.5rem" }}>
        <h2>Run history</h2>
        {history.length === 0 && (
          <div className="empty">No runs yet. Run the test to see results here.</div>
        )}
        <div className="history-list">
          {history.map((r) => (
            <div
              key={r.id}
              className={`card history-item ${selectedRun?.id === r.id ? "selected" : ""}`}
              onClick={() => setSelectedRun(r)}
            >
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              <span className="muted">
                {new Date(r.createdAt).toLocaleString()}
              </span>
              <span className="muted">
                {r.startedAt && r.finishedAt
                  ? fmtDuration(
                      new Date(r.finishedAt).getTime() -
                        new Date(r.startedAt).getTime()
                    )
                  : ""}
              </span>
              <span className="muted">
                {r.stepsResults?.length || 0} step{r.stepsResults?.length === 1 ? "" : "s"}
              </span>
              {r.error && <span className="muted" style={{ color: "var(--danger)" }}>error</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected run detail ─────────────────────────── */}
      {selectedRun && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            Run result{" "}
            <span className={`badge ${statusBadge(selectedRun.status)}`}>
              {selectedRun.status}
            </span>
          </h2>
          <div className="run-meta">
            Started {selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleString() : "—"}
            {" · "}
            {selectedRun.startedAt && selectedRun.finishedAt
              ? `duration ${fmtDuration(
                  new Date(selectedRun.finishedAt).getTime() -
                    new Date(selectedRun.startedAt).getTime()
                )}`
              : ""}
          </div>
          {selectedRun.error && <div className="alert-error">{selectedRun.error}</div>}

          {selectedRun.artifacts?.finalScreenshot && (
            <figure className="shot" style={{ maxWidth: 420 }}>
              <a className="zoom" href={resolveArtifact(selectedRun.artifacts.finalScreenshot)} target="_blank" rel="noreferrer">
                <img src={resolveArtifact(selectedRun.artifacts.finalScreenshot)} alt="Final page screenshot" />
              </a>
              <figcaption>Final screenshot</figcaption>
            </figure>
          )}

          {selectedRun.stepsResults?.length > 0 && (
            <div>
              <h3>Step timeline</h3>
              <div className="step-list" style={{ marginTop: 10 }}>
                {selectedRun.stepsResults.map((r: any, i: number) => {
                  const meta = stepMeta.get(r.stepId) as any;
                  return (
                    <div key={`${r.stepId}-${i}`} className="step-item">
                      <span className="handle">{i + 1}</span>
                      <span className={`badge ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="summary">
                          <strong>
                            {meta?.name ||
                              (meta ? `${meta.type}${meta.config?.url ? " → " + meta.config.url : ""}` : r.stepId)}
                          </strong>
                          {r.durationMs != null && (
                            <span className="muted"> · {fmtDuration(r.durationMs)}</span>
                          )}
                        </div>
                        {r.error && (
                          <div className="muted" style={{ color: "var(--danger)", marginTop: 2 }}>
                            {r.error}
                          </div>
                        )}
                      </div>
                      {r.screenshot && (
                        <a href={resolveArtifact(r.screenshot)} target="_blank" rel="noreferrer">
                          <img
                            src={resolveArtifact(r.screenshot)}
                            alt={`Step ${i + 1} screenshot`}
                            style={{
                              width: 100,
                              height: 64,
                              objectFit: "cover",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                            }}
                          />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              {(selectedRun.stepsResults as any[]).filter((r) => r.screenshot).length >
                0 && (
                <>
                  <h3 style={{ marginTop: "1.4rem" }}>Screenshots</h3>
                  <div className="gallery">
                    {selectedRun.stepsResults.map((r: any, i: number) =>
                      r.screenshot ? (
                        <figure key={`shot-${i}`} className="shot">
                          <a className="zoom" href={resolveArtifact(r.screenshot)} target="_blank" rel="noreferrer">
                            <img src={resolveArtifact(r.screenshot)} alt={`Step ${i + 1} screenshot`} />
                          </a>
                          <figcaption>
                            Step {i + 1} · {r.status}
                            {r.meta?.baselineCreated ? " · baseline" : ""}
                            {r.meta?.diffRatio != null
                              ? ` · diff ${(r.meta.diffRatio * 100).toFixed(2)}%`
                              : ""}
                          </figcaption>
                        </figure>
                      ) : null
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}