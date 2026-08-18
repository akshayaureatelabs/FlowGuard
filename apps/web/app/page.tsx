"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function HomePage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
      setError("");
      await api.createProject(name.trim());
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      setError("");
      await api.updateProject(editingId, editName.trim());
      setEditingId(null);
      setEditName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string, projectName: string) => {
    if (
      !confirm(
        `Delete project "${projectName}"?\n\nThis will also delete all environments, tests, and runs inside it.`
      )
    ) {
      return;
    }
    try {
      setError("");
      await api.deleteProject(id);
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
        <div
          key={p.id}
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            {editingId === p.id ? (
              <div className="form-row" style={{ marginBottom: 0 }}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  style={{ minWidth: 220 }}
                />
                <button className="btn btn-sm" onClick={saveEdit}>
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <a href={`/projects/${p.id}`}>{p.name}</a>
                <div className="muted" style={{ marginTop: 4 }}>
                  {new Date(p.createdAt).toLocaleString()}
                </div>
              </>
            )}
          </div>

          {editingId !== p.id && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => startEdit(p)}
              >
                Edit
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                onClick={() => remove(p.id, p.name)}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
