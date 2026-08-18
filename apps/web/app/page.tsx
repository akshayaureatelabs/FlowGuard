"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function HomePage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.listProjects();
      setProjects(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.createProject(name.trim());
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h1>Projects</h1>

      <div className="form-row">
        <div className="field">
          <label>New project name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My website"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </div>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <label>&nbsp;</label>
          <button className="btn" onClick={create}>
            Create Project
          </button>
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && projects.length === 0 && (
        <div className="empty">No projects yet. Create one above.</div>
      )}

      {projects.map((p) => (
        <div key={p.id} className="card">
          <a href={`/projects/${p.id}`}>{p.name}</a>
          <div className="muted" style={{ marginTop: 4 }}>
            {new Date(p.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
