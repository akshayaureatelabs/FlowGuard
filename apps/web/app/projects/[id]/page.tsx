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

  const load = async () => {
    try {
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

  const createTest = async () => {
    if (!testName.trim()) return;
    try {
      const t = await api.createTest(projectId, testName.trim());
      setTestName("");
      window.location.href = `/tests/${t.id}`;
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!project && !error) return <p className="muted">Loading…</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div>
      <h1>{project?.name}</h1>

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
        <div key={e.id} className="card">
          <strong>{e.name}</strong>
          <div className="muted">{e.baseUrl}</div>
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
        <div key={t.id} className="card">
          <a href={`/tests/${t.id}`}>{t.name}</a>
          <div className="muted">
            {t.steps?.length || 0} steps ·{" "}
            {new Date(t.updatedAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
