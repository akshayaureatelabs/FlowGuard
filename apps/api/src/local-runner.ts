import { chromium, firefox, type Browser, type Page, type Locator } from "playwright";
import path from "path";
import fs from "fs";
import pixelmatchRaw from "pixelmatch";
import { PNG } from "pngjs";
import AxeBuilder from "@axe-core/playwright";
import type { Test, Environment, Step, StepResult, Module } from "@flowguard/shared";
import { repo } from "./repo.js";
import { trackRunFinished } from "./metrics.js";

export const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), "artifacts");
const BASELINES_DIR = path.join(ARTIFACTS_DIR, "baselines");

const pixelmatch = (pixelmatchRaw as any).default ?? pixelmatchRaw;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Convert an absolute artifact file path into a public URL served by the API. */
export function artifactUrl(file: string): string {
  if (!file) return file;
  const base = path.resolve(ARTIFACTS_DIR);
  const abs = path.resolve(file);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return file;
  return `/artifacts/${rel.split(path.sep).join("/")}`;
}

const AXE_TAGS: Record<string, string[]> = {
  wcag2a: ["wcag2a"],
  wcag2aa: ["wcag2a", "wcag2aa"],
  wcag21aa: ["wcag2a", "wcag2aa", "wcag21aa"],
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
    { stepId: step.id, durationMs: Date.now() - start, ...partial },
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
        return one({ status: "passed", screenshot: artifactUrl(file) });
      }
      case "javascript": {
        const code = interpolate(step.config.code, vars);
        if (step.config.async) await page.evaluate(`(async () => { ${code} })()`);
        else await page.evaluate(code);
        break;
      }
      case "accessibility": {
        const standard = step.config.standard || "wcag2aa";
        const builder = new AxeBuilder({ page }).withTags(AXE_TAGS[standard] || ["wcag2aa"]);
        if (step.config.selector?.primary) {
          builder.include(step.config.selector.primary);
        }
        const results = await builder.analyze();
        const violations = results.violations || [];
        if (violations.length) {
          const summary = violations
            .slice(0, 5)
            .map((v) => `${v.id} (${v.impact || "minor"})`)
            .join(", ");
          throw new Error(
            `A11y (${standard}): ${violations.length} violation(s): ${summary}`
          );
        }
        return one({ status: "passed", meta: { standard, violations: [] } });
      }
      case "visualAssert": {
        ensureDir(BASELINES_DIR);
        const baselinePath = path.join(BASELINES_DIR, `${step.config.baselineName}.png`);
        const currentPath = path.join(runDir, `visual-${step.id}.png`);
        const diffPath = path.join(runDir, `visual-${step.id}-diff.png`);
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
            screenshot: artifactUrl(currentPath),
            meta: { baselineCreated: true, baselinePath },
          });
        }
        const a = PNG.sync.read(fs.readFileSync(baselinePath));
        const b = PNG.sync.read(fs.readFileSync(currentPath));
        const threshold = step.config.threshold ?? 0.01;
        if (a.width !== b.width || a.height !== b.height) {
          throw new Error(
            `Visual diff: dimensions differ ${a.width}x${a.height} vs ${b.width}x${b.height}`
          );
        }
        const diff = new PNG({ width: a.width, height: a.height });
        const diffPixels = pixelmatch(
          a.data,
          b.data,
          diff.data,
          a.width,
          a.height,
          { threshold: 0.1 }
        );
        const ratio = diffPixels / (a.width * a.height);
        if (ratio > threshold) {
          fs.writeFileSync(diffPath, PNG.sync.write(diff));
          throw new Error(
            `Visual diff ${(ratio * 100).toFixed(2)}% pixels differ (threshold ${(threshold * 100).toFixed(1)}%). Diff: ${artifactUrl(diffPath)}`
          );
        }
        return one({
          status: "passed",
          screenshot: artifactUrl(currentPath),
          meta: { baselinePath, diffPixels, diffRatio: ratio },
        });
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
    return one({ status: "passed", screenshot: artifactUrl(shot) });
  } catch (err: any) {
    const shot = path.join(runDir, `${step.id}-error.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    return one({
      status: "failed",
      error: err?.message || String(err),
      screenshot: artifactUrl(shot),
    });
  }
}

export async function runLocalTest(
  runId: string,
  test: Test,
  env: Environment
): Promise<void> {
  await repo.updateRun(runId, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const runDir = path.join(ARTIFACTS_DIR, runId);
  ensureDir(runDir);
  ensureDir(BASELINES_DIR);

  let browser: Browser | null = null;
  const results: StepResult[] = [];
  const moduleList = await repo.listModules(test.projectId);
  const modules = new Map<string, Module>(
    moduleList.map((m: Module) => [m.id, m] as const)
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
    await repo.updateRun(runId, {
      status: failed ? "failed" : "passed",
      finishedAt: new Date().toISOString(),
      stepsResults: results,
      artifacts: { finalScreenshot: artifactUrl(finalShot) },
    });
    trackRunFinished();
  } catch (err: any) {
    await repo.updateRun(runId, {
      status: "error",
      error: err?.message || String(err),
      finishedAt: new Date().toISOString(),
      stepsResults: results,
    });
    trackRunFinished();
  } finally {
    if (browser) await browser.close();
  }
}
