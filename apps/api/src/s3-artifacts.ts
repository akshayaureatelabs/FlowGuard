import fs from "fs";
import path from "path";

/**
 * Optional S3/MinIO upload for screenshots so artifacts survive ephemeral disks.
 * Enabled when S3_ENDPOINT + S3_ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET are set.
 * Uses AWS Signature V4 via fetch (no heavy SDK) — works with MinIO + S3.
 */

const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/$/, "");
const accessKey = process.env.S3_ACCESS_KEY || "";
const secretKey = process.env.S3_SECRET_KEY || "";
const bucket = process.env.S3_BUCKET || "";
const region = process.env.S3_REGION || "us-east-1";
const publicBase = (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");

export function s3Enabled(): boolean {
  return !!(endpoint && accessKey && secretKey && bucket);
}

async function hmac(key: Buffer | string, data: string): Promise<Buffer> {
  const crypto = await import("crypto");
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

async function sha256(data: Buffer | string): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(data).digest("hex");
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, day: iso.slice(0, 8) };
}

/** Put a local file into the bucket under key. Returns public or path-style URL. */
export async function uploadArtifact(
  localPath: string,
  key: string
): Promise<string | null> {
  if (!s3Enabled() || !fs.existsSync(localPath)) return null;
  try {
    const body = fs.readFileSync(localPath);
    const host = endpoint.replace(/^https?:\/\//, "");
    const url = `${endpoint}/${bucket}/${key}`;
    const { amz, day } = amzDate();
    const payloadHash = await sha256(body);
    const contentType = localPath.endsWith(".png")
      ? "image/png"
      : "application/octet-stream";

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amz}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      `/${bucket}/${key}`,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${day}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amz,
      credentialScope,
      await sha256(canonicalRequest),
    ].join("\n");

    const kDate = await hmac(`AWS4${secretKey}`, day);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, "s3");
    const kSigning = await hmac(kService, "aws4_request");
    const signature = (await hmac(kSigning, stringToSign)).toString("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Host: host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amz,
        Authorization: authorization,
      },
      body,
    });

    if (!res.ok) {
      console.warn(`[s3] upload failed ${res.status} ${await res.text()}`);
      return null;
    }

    if (publicBase) return `${publicBase}/${key}`;
    return url;
  } catch (err) {
    console.warn("[s3] upload error", err);
    return null;
  }
}

/** Upload every file under runDir; returns map localBasename → remote URL. */
export async function uploadRunDir(
  runId: string,
  runDir: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!s3Enabled() || !fs.existsSync(runDir)) return out;
  const files = fs.readdirSync(runDir);
  for (const f of files) {
    const full = path.join(runDir, f);
    if (!fs.statSync(full).isFile()) continue;
    const key = `runs/${runId}/${f}`;
    const remote = await uploadArtifact(full, key);
    if (remote) out[f] = remote;
  }
  return out;
}
