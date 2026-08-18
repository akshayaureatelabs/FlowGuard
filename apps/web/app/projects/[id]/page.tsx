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
  const [envName, setEnvName] = useState("");
  const [envUrl, setEnvUrl] = useState("https://example.com");
  const [testName, setTestName] = useState("");
  const [error, setError] = useState("");
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState("");
  const [editEnvUrl, setEditEnvUrl] = useState("");
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editTestName, setEditTestName] = useState("");

  const load = async () => {
    try {
      setError("");
      const [p, e, t] = await Promise.all([
        api.getProject(projectId),
        api.listEnvironments(projectId),
        api.listTests(projectId),
      ]);
      setProject(p);
      setEnvs(e);
      setTests(t);
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

  if (!project && !error) return <p className="muted">Loading…</p>;
  if (error && !project)
    return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div>
      <h1>{project?.name}</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <h2>Environments</h2>
      <div className="form-row">
        <div className="field">
          <label>Name</label>
          <input
            value={envName}
            onChange={(e) => setEnvName(e.target.value)}
            placeholder="Production"
          />
        </div>
        <div className="field">
          <label>Base URL</label>
          <input
            value={envUrl}
            onChange={(e) => setEnvUrl(e.target.value)}
            placeholder="https://example.com"
            style={{ minWidth: 260 }}
          />
        </div>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <label>&nbsp;</label>
          <button className="btn" onClick={createEnv}>
            Add Environment
          </button>
        </div>
      </div>

      {envs.length === 0 && (
        <div className="empty">No environments yet.</div>
      )}
      {envs.map((e) => (
        <div
          key={e.id}
          className="card"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          {editingEnvId === e.id ? (
            <div className="form-row" style={{ marginBottom: 0, flex: 1 }}>
              <input
                value={editEnvName}
                onChange={(ev) => setEditEnvName(ev.target.value)}
                placeholder="Name"
              />
              <input
                value={editEnvUrl}
                onChange={(ev) => setEditEnvUrl(ev.target.value)}
                placeholder="Base URL"
                style={{ minWidth: 220 }}
              />
              <button className="btn btn-sm" onClick={saveEnv}>
                Save
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingEnvId(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div>
                <strong>{e.name}</strong>
                <div className="muted">{e.baseUrl}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingEnvId(e.id);
                    setEditEnvName(e.name);
                    setEditEnvUrl(e.baseUrl);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => deleteEnv(e.id, e.name)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      <h2>Tests</h2>
      <div className="form-row">
        <div className="field">
          <label>New test name</label>
          <input
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Homepage smoke"
            onKeyDown={(e) => e.key === "Enter" && createTest()}
          />
        </div>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <label>&nbsp;</label>
          <button className="btn" onClick={createTest}>
            Create Test
          </button>
        </div>
      </div>

      {tests.length === 0 && <div className="empty">No tests yet.</div>}
      {tests.map((t) => (
        <div
          key={t.id}
          className="card"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          {editingTestId === t.id ? (
            <div className="form-row" style={{ marginBottom: 0, flex: 1 }}>
              <input
                value={editTestName}
                onChange={(ev) => setEditTestName(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") saveTest();
                  if (ev.key === "Escape") setEditingTestId(null);
                }}
                autoFocus
              />
              <button className="btn btn-sm" onClick={saveTest}>
                Save
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingTestId(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div>
                <a href={`/tests/${t.id}`}>{t.name}</a>
                <div className="muted">
                  {t.steps?.length || 0} steps ·{" "}
                  {new Date(t.updatedAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingTestId(t.id);
                    setEditTestName(t.name);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => deleteTest(t.id, t.name)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
