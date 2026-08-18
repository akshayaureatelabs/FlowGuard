"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [envs, setEnvs] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [envName, setEnvName] = useState("");
  const [envUrl, setEnvUrl] = useState("https://example.com");
  const [testName, setTestName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [error, setError] = useState("");
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState("");
  const [editEnvUrl, setEditEnvUrl] = useState("");
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editTestName, setEditTestName] = useState("");

  const load = async () => {
    try {
      setError("");
      const [p, e, t, m] = await Promise.all([
        api.getProject(projectId),
        api.listEnvironments(projectId),
        api.listTests(projectId),
        api.listModules(projectId),
      ]);
      setProject(p);
      setEnvs(e);
      setTests(t);
      setModules(m);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const createEnv = async () => {
    if (!envName.trim() || !envUrl.trim()) return;
    try {
      setError("");
      await api.createEnvironment(projectId, {
        name: envName.trim(),
        baseUrl: envUrl.trim(),
      });
      setEnvName("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveEnv = async () => {
    if (!editingEnvId || !editEnvName.trim() || !editEnvUrl.trim()) return;
    try {
      setError("");
      await api.updateEnvironment(editingEnvId, {
        name: editEnvName.trim(),
        baseUrl: editEnvUrl.trim(),
      });
      setEditingEnvId(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteEnv = async (id: string, name: string) => {
    if (!confirm(`Delete environment "${name}"?`)) return;
    try {
      setError("");
      await api.deleteEnvironment(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createTest = async () => {
    if (!testName.trim()) return;
    try {
      setError("");
      const t = await api.createTest(projectId, testName.trim());
      setTestName("");
      window.location.href = `/tests/${t.id}`;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveTest = async () => {
    if (!editingTestId || !editTestName.trim()) return;
    try {
      setError("");
      await api.updateTest(editingTestId, editTestName.trim());
      setEditingTestId(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteTest = async (id: string, name: string) => {
    if (!confirm(`Delete test "${name}"? This removes all its runs too.`)) return;
    try {
      setError("");
      await api.deleteTest(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createModule = async () => {
    if (!moduleName.trim()) return;
    try {
      setError("");
      await api.createModule(projectId, moduleName.trim());
      setModuleName("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteModule = async (id: string, name: string) => {
    if (!confirm(`Delete module "${name}"?`)) return;
    try {
      setError("");
      await api.deleteModule(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!project && !error) return <p className="muted">Loading…</p>;
  if (error && !project) return <div className="alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <p className="muted" style={{ marginBottom: 6 }}>
          <a href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>
            ← Projects
          </a>
        </p>
        <h1>{project?.name}</h1>
        <p>Environments, tests, and reusable modules.</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <h2>Environments</h2>
      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Name</label>
            <input value={envName} onChange={(e) => setEnvName(e.target.value)} placeholder="Production" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Base URL</label>
            <input
              value={envUrl}
              onChange={(e) => setEnvUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ width: "100%", minWidth: 200 }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={createEnv}>Add environment</button>
          </div>
        </div>
      </div>

      {envs.length === 0 && <div className="empty">No environments yet.</div>}
      {envs.map((e) => (
        <div key={e.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {editingEnvId === e.id ? (
            <div className="form-row" style={{ marginBottom: 0, flex: 1 }}>
              <input value={editEnvName} onChange={(ev) => setEditEnvName(ev.target.value)} />
              <input value={editEnvUrl} onChange={(ev) => setEditEnvUrl(ev.target.value)} style={{ minWidth: 220 }} />
              <button className="btn btn-sm" onClick={saveEnv}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingEnvId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <div>
                <strong>{e.name}</strong>
                <div className="muted">{e.baseUrl}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingEnvId(e.id); setEditEnvName(e.name); setEditEnvUrl(e.baseUrl); }}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => deleteEnv(e.id, e.name)}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}

      <h2>Tests</h2>
      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>New test name</label>
            <input
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Homepage smoke / Login flow"
              onKeyDown={(e) => e.key === "Enter" && createTest()}
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={createTest}>Create test</button>
          </div>
        </div>
      </div>

      {tests.length === 0 && <div className="empty">No tests yet.</div>}
      {tests.map((t) => (
        <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {editingTestId === t.id ? (
            <div className="form-row" style={{ marginBottom: 0, flex: 1 }}>
              <input value={editTestName} onChange={(ev) => setEditTestName(ev.target.value)} autoFocus />
              <button className="btn btn-sm" onClick={saveTest}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTestId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <div>
                <a href={`/tests/${t.id}`}>{t.name}</a>
                <div className="muted">{t.steps?.length || 0} steps · {new Date(t.updatedAt).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingTestId(t.id); setEditTestName(t.name); }}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => deleteTest(t.id, t.name)}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}

      <h2>Reusable modules</h2>
      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Module name</label>
            <input
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="Login flow"
              onKeyDown={(e) => e.key === "Enter" && createModule()}
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={createModule}>Create module</button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Modules are shared step sequences. Reference them from tests via a module step (API).
        </p>
      </div>

      {modules.length === 0 && <div className="empty">No modules yet.</div>}
      {modules.map((m) => (
        <div key={m.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{m.name}</strong>
            <div className="muted">{m.steps?.length || 0} steps · id: {m.id}</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => deleteModule(m.id, m.name)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
