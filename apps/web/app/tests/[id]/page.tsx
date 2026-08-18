"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import StepEditor, { EditorStep } from "@/components/editor/StepEditor";

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

  const load = useCallback(async () => {
    try {
      const t = await api.getTest(testId);
      setTest(t);
      setSteps(t.steps || []);
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
    try {
      const updated = await api.updateSteps(testId, steps);
      setTest(updated);
      setMsg("Steps saved");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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
      await api.updateSteps(testId, steps);
      const r = await api.createRun(testId, envId);
      setRun(r);
      const poll = async () => {
        const latest = await api.getRun(r.id);
        setRun(latest);
        if (latest.status === "queued" || latest.status === "running") {
          setTimeout(poll, 1000);
        } else {
          setRunning(false);
        }
      };
      setTimeout(poll, 800);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  };

  if (!test && !error) return <p className="muted">Loading…</p>;
  if (error && !test)
    return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>{test?.name}</h1>
          <a href={`/projects/${test?.projectId}`} className="muted">
            ← Back to project
          </a>
        </div>
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
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <label>&nbsp;</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="btn"
                onClick={startRun}
                disabled={running || !envId}
              >
                {running ? "Running…" : "Run Test"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {msg && <p style={{ color: "var(--success)", marginTop: 8 }}>{msg}</p>}
      {error && (
        <p style={{ color: "var(--danger)", marginTop: 8 }}>{error}</p>
      )}

      <h2>Steps</h2>
      <StepEditor steps={steps} onChange={setSteps} />

      {run && (
        <div style={{ marginTop: "2rem" }}>
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
          {run.error && (
            <p style={{ color: "var(--danger)" }}>{run.error}</p>
          )}
          {run.stepsResults?.length > 0 && (
            <div className="step-list" style={{ marginTop: 12 }}>
              {run.stepsResults.map((r: any) => (
                <div key={r.stepId} className="step-item">
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
