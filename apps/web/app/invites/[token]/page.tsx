"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function AcceptInvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getToken()) {
      setStatus("err");
      setMessage("Sign in first, then open this invite link again.");
    }
  }, []);

  const accept = async () => {
    setStatus("loading");
    setMessage("");
    try {
      await api.acceptInvite(token);
      setStatus("ok");
      setMessage("You're on the team. Redirecting…");
      setTimeout(() => router.push("/teams"), 1200);
    } catch (e: any) {
      setStatus("err");
      setMessage(e.message || "Invite invalid or expired");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Team invite</h1>
        <p>Accept this invite to join a FlowGuard team and share projects.</p>
      </div>

      <div className="panel-box" style={{ maxWidth: 420 }}>
        {status === "ok" && <div className="alert-success">{message}</div>}
        {status === "err" && <div className="alert-error">{message}</div>}
        {status !== "ok" && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              Token: <code>{token?.slice(0, 12)}…</code>
            </p>
            <button className="btn" onClick={accept} disabled={status === "loading" || !getToken()}>
              {status === "loading" ? "Accepting…" : "Accept invite"}
            </button>
            {!getToken() && (
              <p style={{ marginTop: 12 }}>
                <a href="/login">Sign in</a> first, then return here.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
