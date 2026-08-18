import { chromium, firefox, type Browser, type Page, type Locator } from "playwright";
import path from "path";
import fs from "fs";
import type { Test, Environment, Step, StepResult, Module } from "@flowguard/shared";
import { store } from "./store.js";

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), "artifacts");
const BASELINES_DIR = path.join(ARTIFACTS_DIR, "baselines");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function locate(
  page: Page,
  sel: { primary: string; type?: string; backups?: string[] }
): Promise<Locator> {
  const candidates = [sel.primary, ...(sel.backups || [])];
  for (const c of candidates) {
    try {
      const loc =
        sel.type === "xpath" ? page.locator(`xpath=${c}`) : page.locator(c);
      const count = await loc.count();
      if (count > 0) return loc.first();
    } catch {
      /* try next */
    }
  }
  return sel.type === "xpath"
    ? page.locator(`xpath=${sel.primary}`).first()
    : page.locator(sel.primary).first();
}

function interpolate(value: string, vars: Record<string, string> = {}) {
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

async function executeStep(
  page: Page,
  step: Step,
  baseUrl: string,
  runDir: string,
  vars: Record<string, string>,
  modules: Map<string, Module>
): Promise<StepResult[]> {
  const start = Date.now();
  const one = (partial: Partial<StepResult> & { status: StepResult["status"] }): StepResult[] => [
    {
      stepId: step.id,
      durationMs: Date.now() - start,
      ...partial,
    },
  ];

  try {
    switch (step.type) {
      case "navigate": {
        const raw = interpolate(step.config.url, vars);
        const url = raw.startsWith("http") ? raw : new URL(raw, baseUrl).toString();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        break;
      }
      case "click": {
        const loc = await locate(page, step.config.selector);
        await loc.click({
          button: step.config.button || "left",
          clickCount: step.config.clickCount || 1,
        });
        break;
      }
      case "type": {
        const loc = await locate(page, step.config.selector);
        const value = interpolate(step.config.value, vars);
        if (step.config.clearFirst) await loc.fill("");
        await loc.fill(value);
        break;
      }
      case "clear": {
        const loc = await locate(page, step.config.selector);
        await loc.fill("");
        break;
      }
      case "select": {
        const loc = await locate(page, step.config.selector);
        await loc.selectOption(interpolate(step.config.value, vars));
        break;
      }
      case "hover": {
        const loc = await locate(page, step.config.selector);
        await loc.hover();
        break;
      }
      case "wait": {
        if (step.config.ms) await page.waitForTimeout(step.config.ms);
        else if (step.config.selector) {
          const loc = await locate(page, step.config.selector);
          await loc.waitFor({ state: step.config.state || "visible" });
        } else await page.waitForTimeout(1000);
        break;
      }
      case "assert": {
        const { assertion, expected, selector, attribute } = step.config;
        const exp = String(expected);
        if (assertion === "urlContains") {
          if (!page.url().includes(exp)) throw new Error(`URL does not contain "${exp}"`);
        } else if (assertion === "urlEquals") {
          if (page.url() !== exp) throw new Error(`URL !== "${exp}"`);
        } else if (selector) {
          const loc = await locate(page, selector);
          if (assertion === "textContains") {
            const text = (await loc.textContent()) || "";
            if (!text.includes(exp)) throw new Error(`Text does not contain "${exp}"`);
          } else if (assertion === "textEquals") {
            const text = ((await loc.textContent()) || "").trim();
            if (text !== exp) throw new Error(`Text "${text}" !== "${exp}"`);
          } else if (assertion === "elementVisible") {
            if (!(await loc.isVisible())) throw new Error("Element not visible");
          } else if (assertion === "elementNotVisible") {
            if (await loc.isVisible()) throw new Error("Element is visible");
          } else if (assertion === "elementEnabled") {
            if (!(await loc.isEnabled())) throw new Error("Element not enabled");
          } else if (assertion === "elementDisabled") {
            if (await loc.isEnabled()) throw new Error("Element is enabled");
          } else if (assertion === "attributeEquals" && attribute) {
            const val = await loc.getAttribute(attribute);
            if (val !== exp) throw new Error(`attr ${attribute}="${val}" !== "${exp}"`);
          } else if (assertion === "countEquals") {
            const count = await loc.count();
            if (count !== Number(expected)) throw new Error(`count ${count} !== ${expected}`);
          }
        }
        break;
      }
      case "screenshot": {
        const file = path.join(runDir, `${step.id}.png`);
        if (step.config.selector) {
          const loc = await locate(page, step.config.selector);
          await loc.screenshot({ path: file });
        } else {
          await page.screenshot({ path: file, fullPage: step.config.fullPage ?? false });
        }
        return one({ status: "passed", screenshot: file });
      }
      case "javascript": {
        const code = interpolate(step.config.code, vars);
        if (step.config.async) await page.evaluate(`(async () => { ${code} })()`);
        else await page.evaluate(code);
        break;
      }
      case "accessibility": {
        // Lightweight a11y heuristics (full axe can be added later)
        const issues: string[] = [];
        const imgs = await page.locator("img:not([alt])").count();
        if (imgs > 0) issues.push(`${imgs} image(s) missing alt`);
        const emptyButtons = await page.locator("button:not([aria-label])").evaluateAll(
          (nodes) => nodes.filter((n) => !(n as HTMLElement).innerText?.trim()).length
        );
        if (emptyButtons > 0) issues.push(`${emptyButtons} button(s) without accessible name`);
        if (issues.length) {
          throw new Error(`A11y (${step.config.standard}): ${issues.join("; ")}`);
        }
        return one({ status: "passed", meta: { standard: step.config.standard, issues: [] } });
      }
      case "visualAssert": {
        ensureDir(BASELINES_DIR);
        const baselinePath = path.join(BASELINES_DIR, `${step.config.baselineName}.png`);
        const currentPath = path.join(runDir, `visual-${step.id}.png`);
        if (step.config.selector) {
          const loc = await locate(page, step.config.selector);
          await loc.screenshot({ path: currentPath });
        } else {
          await page.screenshot({
            path: currentPath,
            fullPage: step.config.fullPage ?? true,
          });
        }
        if (!fs.existsSync(baselinePath)) {
          fs.copyFileSync(currentPath, baselinePath);
          return one({
            status: "passed",
            screenshot: currentPath,
            meta: { baselineCreated: true, baselinePath },
          });
        }
        // Simple size/byte compare for MVP (pixelmatch can replace later)
        const a = fs.readFileSync(baselinePath);
        const b = fs.readFileSync(currentPath);
        const threshold = step.config.threshold ?? 0.01;
        if (a.length !== b.length) {
          const diffRatio = Math.abs(a.length - b.length) / Math.max(a.length, b.length);
          if (diffRatio > threshold) {
            throw new Error(
              `Visual diff detected (size delta ${(diffRatio * 100).toFixed(1)}%). Baseline: ${baselinePath}`
            );
          }
        } else if (!a.equals(b)) {
          // bytes differ but same size — flag as soft fail for MVP
          const mismatch = a.reduce((n, byte, i) => n + (byte !== b[i] ? 1 : 0), 0);
          const ratio = mismatch / a.length;
          if (ratio > threshold) {
            throw new Error(
              `Visual diff ${(ratio * 100).toFixed(2)}% pixels differ (threshold ${(threshold * 100).toFixed(1)}%)`
            );
          }
        }
        return one({ status: "passed", screenshot: currentPath, meta: { baselinePath } });
      }
      case "module": {
        const mod = modules.get(step.config.moduleId);
        if (!mod) throw new Error(`Module ${step.config.moduleId} not found`);
        const merged = { ...vars, ...(step.config.variables || {}) };
        const results: StepResult[] = [];
        for (const sub of mod.steps) {
          const subResults = await executeStep(page, sub, baseUrl, runDir, merged, modules);
          results.push(...subResults);
          if (subResults.some((r) => r.status === "failed") && !sub.optional) break;
        }
        return results;
      }
      default:
        return one({ status: "skipped" });
    }

    const shot = path.join(runDir, `${step.id}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    return one({ status: "passed", screenshot: shot });
  } catch (err: any) {
    const shot = path.join(runDir, `${step.id}-error.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    return one({
      status: "failed",
      error: err?.message || String(err),
      screenshot: shot,
    });
  }
}

export async function runLocalTest(
  runId: string,
  test: Test,
  env: Environment
): Promise<void> {
  store.updateRun(runId, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const runDir = path.join(ARTIFACTS_DIR, runId);
  ensureDir(runDir);
  ensureDir(BASELINES_DIR);

  let browser: Browser | null = null;
  const results: StepResult[] = [];
  const modules = new Map(
    store.listModules(test.projectId).map((m) => [m.id, m] as const)
  );
  const vars = { ...(env.variables || {}) };

  try {
    const browserName = test.settings?.browser || "chrome";
    browser =
      browserName === "firefox"
        ? await firefox.launch({ headless: true })
        : await chromium.launch({ headless: true });

    const context = await browser.newContext({
      viewport: test.settings?.viewport || { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    if (test.steps.length === 0 || test.steps[0].type !== "navigate") {
      await page.goto(env.baseUrl, { waitUntil: "domcontentloaded" });
    }

    for (const step of test.steps) {
      const stepResults = await executeStep(
        page,
        step,
        env.baseUrl,
        runDir,
        vars,
        modules
      );
      results.push(...stepResults);
      if (stepResults.some((r) => r.status === "failed") && !step.optional) break;
    }

    const finalShot = path.join(runDir, "final.png");
    await page.screenshot({ path: finalShot, fullPage: true }).catch(() => {});

    const failed = results.some((r) => r.status === "failed");
    store.updateRun(runId, {
      status: failed ? "failed" : "passed",
      finishedAt: new Date().toISOString(),
      stepsResults: results,
      artifacts: { finalScreenshot: finalShot },
    });
  } catch (err: any) {
    store.updateRun(runId, {
      status: "error",
      error: err?.message || String(err),
      finishedAt: new Date().toISOString(),
      stepsResults: results,
    });
  } finally {
    if (browser) await browser.close();
  }
}
