"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import StepEditor, { EditorStep } from "@/components/editor/StepEditor";
import { v4 as uuid } from "uuid";

export default function TestEditorPage() {
  const params = useParams();
  const testId = params.id as string;

  const [test, setTest] = useState<any>(null);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [envs, setEnvs] = useState<any[]>([]);
  const [envId, setEnvId] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [browser, setBrowser] = useState("chrome");
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(720);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [intervalMin, setIntervalMin] = useState(60);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [importJson, setImportJson] = useState("");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api.getTest(testId);
      setTest(t);
      setSteps(t.steps || []);
      setBrowser(t.settings?.browser || "chrome");
      setVw(t.settings?.viewport?.width || 1280);
      setVh(t.settings?.viewport?.height || 720);
      const projectEnvs = await api.listEnvironments(t.projectId);
      setEnvs(projectEnvs);
      if (projectEnvs.length && !envId) setEnvId(projectEnvs[0].id);
      const sch = await api.listSchedules(testId);
      setSchedules(sch);
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

  const importSteps = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array of steps");
      const normalized: EditorStep[] = parsed.map((s: any) => ({
        id: s.id || uuid(),
        type: s.type || "click",
        name: s.name,
        optional: s.optional,
        config: s.config || {},
      }));
      setSteps((prev) => [...prev, ...normalized]);
      setImportJson("");
      setShowImport(false);
      setMsg(`Imported ${normalized.length} step(s) from recorder`);
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
    setRun(null);
    try {
      await api.updateTestSettings(testId, {
        browser,
        viewport: { width: vw, height: vh },
      });
      await api.updateSteps(testId, steps);
      const r = await api.createRun(testId, envId);
      setRun(r);
      const poll = async () => {
        const latest = await api.getRun(r.id);
        setRun(latest);
        if (latest.status === "queued" || latest.status === "running") {
          setTimeout(poll, 1000);
        } else setRunning(false);
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
      });
      setMsg(`Schedule every ${intervalMin} min created`);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    try {
      await api.updateSchedule(id, { enabled: !enabled });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeSchedule = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await api.deleteSchedule(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!test && !error) return <p className="muted">Loading…</p>;
  if (error && !test) return <div className="alert-error">{error}</div>;

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
            <button className="btn" onClick={importSteps}>
              Append steps
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

      {run && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            Run result{" "}
            <span
              className={`badge ${
                run.status === "passed"
                  ? "badge-pass"
                  : run.status === "failed" || run.status === "error"
                  ? "badge-fail"
                  : "badge-run"
              }`}
            >
              {run.status}
            </span>
          </h2>
          {run.error && <div className="alert-error">{run.error}</div>}
          {run.stepsResults?.length > 0 && (
            <div className="step-list" style={{ marginTop: 12 }}>
              {run.stepsResults.map((r: any, i: number) => (
                <div key={`${r.stepId}-${i}`} className="step-item">
                  <span
                    className={`badge ${
                      r.status === "passed"
                        ? "badge-pass"
                        : r.status === "failed"
                        ? "badge-fail"
                        : ""
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="summary">
                    {r.error || r.stepId}
                    {r.durationMs != null && ` · ${r.durationMs}ms`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
