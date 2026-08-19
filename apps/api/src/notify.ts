import nodemailer from "nodemailer";
import type { Schedule } from "@flowguard/shared";
import { repo } from "./repo.js";

type RunPayload = {
  event: string;
  status: string;
  testId: string;
  testName?: string;
  environmentId: string;
  environmentName?: string;
  runId: string;
  error?: string;
  time: string;
  url?: string;
  metrics?: { durationMs?: number; steps?: number };
};

const PUBLIC_URL = process.env.PUBLIC_URL || "";

export async function buildAlertPayload(runId: string): Promise<RunPayload | null> {
  const run = await repo.getRun(runId);
  if (!run) return null;
  const test = await repo.getTest(run.testId);
  const env = await repo.getEnvironment(run.environmentId);
  let durationMs: number | undefined;
  let steps = run.stepsResults?.length || 0;
  if (run.startedAt && run.finishedAt) {
    durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  }
  return {
    event: "run.finished",
    status: run.status,
    testId: run.testId,
    testName: test?.name,
    environmentId: run.environmentId,
    environmentName: env?.name,
    runId: run.id,
    error: run.error,
    time: new Date().toISOString(),
    url: PUBLIC_URL ? `${PUBLIC_URL.replace(/\/$/, "")}/tests/${run.testId}` : undefined,
    metrics: { durationMs, steps },
  };
}

/** Send Slack-style incoming webhook for a finished run. */
async function postWebhook(url: string, payload: unknown): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    console.warn(`[alerts] skipping webhook, invalid URL: ${url}`);
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`webhook responded ${res.status} ${res.statusText}`);
  }
}

/** Send email via SMTP only when SMTP_* env vars are configured. */
async function sendEmail(recipient: string, payload: RunPayload): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    console.log(
      `[alerts] email to ${recipient} skipped (SMTP_HOST not configured). Would send: ${payload.status} for test ${payload.testName}`
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  const subject = `[FlowGuard] ${payload.status.toUpperCase()} — ${payload.testName || payload.testId}`;
  await transport.sendMail({
    from: process.env.EMAIL_FROM || `FlowGuard <${process.env.SMTP_USER || "alerts@flowguard"}>`,
    to: recipient,
    subject,
    text: JSON.stringify(payload, null, 2),
  });
}

/**
 * Deliver alerts for a finished run. Only runs that ended in a failed/error state
 * trigger notifications (matches schedule.notifyEmail / notifyWebhook).
 */
export async function notifyForRun(runId: string): Promise<void> {
  try {
    const run = await repo.getRun(runId);
    if (!run) return;
    if (run.status === "passed" || run.status === "queued" || run.status === "running") return;

    const schedules = await repo.listSchedules(run.testId);
    const targets = schedules.filter(
      (s: Schedule) => s.enabled && (s.notifyEmail || s.notifyWebhook)
    );
    if (!targets.length) return;

    const payload = await buildAlertPayload(runId);
    if (!payload) return;

    await Promise.all(
      targets.map(async (s: Schedule) => {
        const jobs: Promise<void>[] = [];
        if (s.notifyWebhook) {
          jobs.push(postWebhook(s.notifyWebhook, payload).catch((e) => {
            console.error(`[alerts] webhook failed for ${s.notifyWebhook}:`, e);
          }));
        }
        if (s.notifyEmail) {
          jobs.push(sendEmail(s.notifyEmail, payload).catch((e) => {
            console.error(`[alerts] email failed for ${s.notifyEmail}:`, e);
          }));
        }
        await Promise.all(jobs);
      })
    );
  } catch (err) {
    console.error("[alerts] notifyForRun error:", err);
  }
}