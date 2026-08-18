"use client";

import { useState } from "react";
import { v4 as uuid } from "uuid";

export type EditorStep = {
  id: string;
  type: string;
  name?: string;
  optional?: boolean;
  config: Record<string, any>;
};

const STEP_TYPES = [
  { value: "navigate", label: "Navigate" },
  { value: "click", label: "Click" },
  { value: "type", label: "Type" },
  { value: "clear", label: "Clear" },
  { value: "select", label: "Select" },
  { value: "hover", label: "Hover" },
  { value: "wait", label: "Wait" },
  { value: "assert", label: "Assert" },
  { value: "screenshot", label: "Screenshot" },
  { value: "javascript", label: "JavaScript" },
  { value: "accessibility", label: "A11y" },
  { value: "visualAssert", label: "Visual" },
];

function defaultConfig(type: string): Record<string, any> {
  switch (type) {
    case "navigate":
      return { url: "/" };
    case "click":
    case "clear":
    case "hover":
      return { selector: { primary: "", type: "css" } };
    case "type":
      return { selector: { primary: "", type: "css" }, value: "", clearFirst: true };
    case "select":
      return { selector: { primary: "", type: "css" }, value: "" };
    case "wait":
      return { ms: 1000 };
    case "assert":
      return {
        assertion: "urlContains",
        expected: "",
        selector: { primary: "", type: "css" },
      };
    case "screenshot":
      return { fullPage: false };
    case "javascript":
      return { code: "console.log('hello')" };
    case "accessibility":
      return { standard: "wcag2aa" };
    case "visualAssert":
      return { baselineName: "home", threshold: 0.01, fullPage: true };
    default:
      return {};
  }
}

function summarize(step: EditorStep): string {
  const c = step.config || {};
  switch (step.type) {
    case "navigate":
      return c.url || "";
    case "click":
    case "clear":
    case "hover":
      return c.selector?.primary || "";
    case "type":
    case "select":
      return `${c.selector?.primary || ""} → "${c.value || ""}"`;
    case "wait":
      return c.ms ? `${c.ms} ms` : c.selector?.primary || "";
    case "assert":
      return `${c.assertion} ${c.expected || ""}`;
    case "screenshot":
      return c.fullPage ? "full page" : "viewport";
    case "javascript":
      return (c.code || "").slice(0, 40);
    case "accessibility":
      return c.standard || "wcag2aa";
    case "visualAssert":
      return c.baselineName || "baseline";
    default:
      return "";
  }
}

interface Props {
  steps: EditorStep[];
  onChange: (steps: EditorStep[]) => void;
}

export default function StepEditor({ steps, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(steps[0]?.id || null);
  const selected = steps.find((s) => s.id === selectedId) || null;

  const addStep = (type: string) => {
    const step: EditorStep = { id: uuid(), type, config: defaultConfig(type) };
    onChange([...steps, step]);
    setSelectedId(step.id);
  };

  const removeStep = (id: string) => {
    const next = steps.filter((s) => s.id !== id);
    onChange(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const updateSelected = (patch: Partial<EditorStep>) => {
    if (!selected) return;
    onChange(steps.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
  };

  const updateConfig = (key: string, value: any) => {
    if (!selected) return;
    updateSelected({ config: { ...selected.config, [key]: value } });
  };

  const updateSelector = (primary: string) => {
    if (!selected) return;
    updateConfig("selector", {
      ...(selected.config.selector || { type: "css" }),
      primary,
    });
  };

  const needsSelector = ["click", "type", "clear", "select", "hover", "assert"].includes(
    selected?.type || ""
  );

  return (
    <div>
      <div className="toolbar">
        {STEP_TYPES.map((t) => (
          <button
            key={t.value}
            className="btn btn-ghost btn-sm"
            onClick={() => addStep(t.value)}
          >
            + {t.label}
          </button>
        ))}
      </div>

      <div className="editor">
        <div className="step-list">
          {steps.length === 0 && (
            <div className="empty">
              No steps yet. Add a step above to start building your test.
            </div>
          )}
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`step-item ${step.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(step.id)}
            >
              <span className="handle">⠿</span>
              <span className="type">{step.type}</span>
              <span className="summary">{summarize(step)}</span>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }}>↑</button>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }}>↓</button>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}>✕</button>
            </div>
          ))}
        </div>

        <div className="panel">
          {selected ? (
            <>
              <h3>
                Edit · <span style={{ textTransform: "capitalize" }}>{selected.type}</span>
              </h3>

              <div className="field">
                <label>Label (optional)</label>
                <input
                  value={selected.name || ""}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  placeholder="Human-friendly name"
                />
              </div>

              {selected.type === "navigate" && (
                <div className="field">
                  <label>URL</label>
                  <input
                    value={selected.config.url || ""}
                    onChange={(e) => updateConfig("url", e.target.value)}
                    placeholder="/login or https://..."
                  />
                </div>
              )}

              {needsSelector && (
                <div className="field">
                  <label>Selector (CSS)</label>
                  <input
                    value={selected.config.selector?.primary || ""}
                    onChange={(e) => updateSelector(e.target.value)}
                    placeholder="#login-btn or input[name=email]"
                  />
                </div>
              )}

              {(selected.type === "type" || selected.type === "select") && (
                <div className="field">
                  <label>Value</label>
                  <input
                    value={selected.config.value || ""}
                    onChange={(e) => updateConfig("value", e.target.value)}
                    placeholder={selected.type === "select" ? "option value" : "text to type"}
                  />
                </div>
              )}

              {selected.type === "type" && (
                <div className="field">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selected.config.clearFirst}
                      onChange={(e) => updateConfig("clearFirst", e.target.checked)}
                      style={{ minWidth: "auto", marginRight: 6 }}
                    />
                    Clear first
                  </label>
                </div>
              )}

              {selected.type === "wait" && (
                <div className="field">
                  <label>Wait (ms)</label>
                  <input
                    type="number"
                    value={selected.config.ms || 1000}
                    onChange={(e) => updateConfig("ms", Number(e.target.value))}
                  />
                </div>
              )}

              {selected.type === "assert" && (
                <>
                  <div className="field">
                    <label>Assertion</label>
                    <select
                      value={selected.config.assertion || "urlContains"}
                      onChange={(e) => updateConfig("assertion", e.target.value)}
                    >
                      <option value="urlContains">URL contains</option>
                      <option value="urlEquals">URL equals</option>
                      <option value="textContains">Text contains</option>
                      <option value="textEquals">Text equals</option>
                      <option value="elementVisible">Element visible</option>
                      <option value="elementNotVisible">Element not visible</option>
                      <option value="elementEnabled">Element enabled</option>
                      <option value="countEquals">Count equals</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Expected</label>
                    <input
                      value={selected.config.expected ?? ""}
                      onChange={(e) => updateConfig("expected", e.target.value)}
                    />
                  </div>
                </>
              )}

              {(selected.type === "screenshot" || selected.type === "visualAssert") && (
                <div className="field">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selected.config.fullPage}
                      onChange={(e) => updateConfig("fullPage", e.target.checked)}
                      style={{ minWidth: "auto", marginRight: 6 }}
                    />
                    Full page
                  </label>
                </div>
              )}

              {selected.type === "visualAssert" && (
                <>
                  <div className="field">
                    <label>Baseline name</label>
                    <input
                      value={selected.config.baselineName || ""}
                      onChange={(e) => updateConfig("baselineName", e.target.value)}
                      placeholder="home-hero"
                    />
                  </div>
                  <div className="field">
                    <label>Threshold (0–1)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selected.config.threshold ?? 0.01}
                      onChange={(e) => updateConfig("threshold", Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              {selected.type === "accessibility" && (
                <div className="field">
                  <label>Standard</label>
                  <select
                    value={selected.config.standard || "wcag2aa"}
                    onChange={(e) => updateConfig("standard", e.target.value)}
                  >
                    <option value="wcag2a">WCAG 2.0 A</option>
                    <option value="wcag2aa">WCAG 2.0 AA</option>
                    <option value="wcag21aa">WCAG 2.1 AA</option>
                  </select>
                </div>
              )}

              {selected.type === "javascript" && (
                <div className="field">
                  <label>Code</label>
                  <textarea
                    rows={5}
                    value={selected.config.code || ""}
                    onChange={(e) => updateConfig("code", e.target.value)}
                    style={{ width: "100%", fontFamily: "monospace" }}
                  />
                </div>
              )}

              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={!!selected.optional}
                    onChange={(e) => updateSelected({ optional: e.target.checked })}
                    style={{ minWidth: "auto", marginRight: 6 }}
                  />
                  Optional (continue on failure)
                </label>
              </div>
            </>
          ) : (
            <p className="muted">Select a step to edit its settings.</p>
          )}
        </div>
      </div>
    </div>
  );
}
