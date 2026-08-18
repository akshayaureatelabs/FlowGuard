"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import StepEditor, { EditorStep } from "@/components/editor/StepEditor";

export default function ModuleEditorPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const [mod, setMod] = useState<any>(null);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await api.getModule(moduleId);
      setMod(m);
      setSteps(m.steps || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [moduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const updated = await api.updateModuleSteps(moduleId, steps);
      setMod(updated);
      setMsg("Module steps saved");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!mod && !error) return <p className="muted">Loading…</p>;
  if (error && !mod) return <div className="alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <p className="muted" style={{ marginBottom: 6 }}>
          <a
            href={`/projects/${mod?.projectId}`}
            style={{ color: "var(--muted)", textDecoration: "none" }}
          >
            ← Back to project
          </a>
        </p>
        <h1>Module · {mod?.name}</h1>
        <p>Reusable step sequence referenced from tests via module steps.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save module"}
        </button>
      </div>

      {msg && <div className="alert-success">{msg}</div>}
      {error && <div className="alert-error">{error}</div>}

      <StepEditor steps={steps} onChange={setSteps} />
    </div>
  );
}
