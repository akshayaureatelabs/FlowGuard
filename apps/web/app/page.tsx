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
      await api.updateProject(editingId, { name: editName.trim() });
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
      <div className="page-header">
        <h1>Projects</h1>
        <p>
          Organize tests by website or app. Anyone on the team can create and
          maintain tests — no coding required.
        </p>
      </div>

      <div className="panel-box">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>New project name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing site, Checkout app"
              onKeyDown={(e) => e.key === "Enter" && create()}
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={create}>
              Create project
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading && <p className="muted">Loading projects…</p>}

      {!loading && projects.length === 0 && (
        <div className="empty">
          <strong style={{ display: "block", marginBottom: 6, color: "var(--text)" }}>
            No projects yet
          </strong>
          Create your first project above to start recording and running browser
          tests.
        </div>
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
                  Created {new Date(p.createdAt).toLocaleString()}
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
