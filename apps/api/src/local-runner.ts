import { chromium, type Browser, type Page } from "playwright";
import path from "path";
import fs from "fs";
import type { Test, Environment, Step, StepResult } from "@flowguard/shared";
import { store } from "./store.js";

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), "artifacts");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveSelector(sel: { primary: string; type?: string }) {
  return sel.primary;
}

async function executeStep(
  page: Page,
  step: Step,
  baseUrl: string,
  runDir: string
): Promise<StepResult> {
  const start = Date.now();
  try {
    switch (step.type) {
      case "navigate": {
        const url = step.config.url.startsWith("http")
          ? step.config.url
          : new URL(step.config.url, baseUrl).toString();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        break;
      }
      case "click": {
        const sel = resolveSelector(step.config.selector);
        await page.click(sel, {
          button: step.config.button || "left",
          clickCount: step.config.clickCount || 1,
        });
        break;
      }
      case "type": {
        const sel = resolveSelector(step.config.selector);
        if (step.config.clearFirst) {
          await page.fill(sel, "");
        }
        await page.fill(sel, step.config.value);
        break;
      }
      case "wait": {
        if (step.config.ms) {
          await page.waitForTimeout(step.config.ms);
        } else if (step.config.selector) {
          const sel = resolveSelector(step.config.selector);
          await page.waitForSelector(sel, {
            state: step.config.state || "visible",
          });
        } else {
          await page.waitForTimeout(1000);
        }
        break;
      }
      case "assert": {
        const { assertion, expected, selector } = step.config;
        if (assertion === "urlContains") {
          const url = page.url();
          if (!url.includes(String(expected))) {
            throw new Error(`URL "${url}" does not contain "${expected}"`);
          }
        } else if (assertion === "urlEquals") {
          const url = page.url();
          if (url !== String(expected)) {
            throw new Error(`URL "${url}" !== "${expected}"`);
          }
        } else if (assertion === "textContains" && selector) {
          const sel = resolveSelector(selector);
          const text = await page.textContent(sel);
          if (!text || !text.includes(String(expected))) {
            throw new Error(`Text does not contain "${expected}"`);
          }
        } else if (assertion === "elementVisible" && selector) {
          const sel = resolveSelector(selector);
          const visible = await page.isVisible(sel);
          if (!visible) throw new Error(`Element ${sel} is not visible`);
        } else if (assertion === "elementNotVisible" && selector) {
          const sel = resolveSelector(selector);
          const visible = await page.isVisible(sel);
          if (visible) throw new Error(`Element ${sel} is visible`);
        }
        break;
      }
      case "screenshot": {
        const file = path.join(runDir, `${step.id}.png`);
        if (step.config.selector) {
          const sel = resolveSelector(step.config.selector);
          await page.locator(sel).screenshot({ path: file });
        } else {
          await page.screenshot({
            path: file,
            fullPage: step.config.fullPage ?? false,
          });
        }
        return {
          stepId: step.id,
          status: "passed",
          screenshot: file,
          durationMs: Date.now() - start,
        };
      }
      case "javascript": {
        if (step.config.async) {
          await page.evaluate(`(async () => { ${step.config.code} })()`);
        } else {
          await page.evaluate(step.config.code);
        }
        break;
      }
      default:
        return {
          stepId: step.id,
          status: "skipped",
          durationMs: Date.now() - start,
        };
    }

    const shot = path.join(runDir, `${step.id}.png`);
    await page.screenshot({ path: shot }).catch(() => {});

    return {
      stepId: step.id,
      status: "passed",
      screenshot: shot,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const shot = path.join(runDir, `${step.id}-error.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    return {
      stepId: step.id,
      status: "failed",
      error: err?.message || String(err),
      screenshot: shot,
      durationMs: Date.now() - start,
    };
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

  let browser: Browser | null = null;
  const results: StepResult[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: test.settings?.viewport || { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    if (test.steps.length === 0 || test.steps[0].type !== "navigate") {
      await page.goto(env.baseUrl, { waitUntil: "domcontentloaded" });
    }

    for (const step of test.steps) {
      const result = await executeStep(page, step, env.baseUrl, runDir);
      results.push(result);
      if (result.status === "failed" && !step.optional) {
        break;
      }
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
