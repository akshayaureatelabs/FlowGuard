"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const user = await api.register({ email, password, name: name || undefined });
        const login = await api.login({ email, password });
        setSession({
          token: login.token,
          apiKey: login.user?.apiKey || user.apiKey,
          user: login.user || user,
        });
      } else {
        const login = await api.login({ email, password });
        setSession({
          token: login.token,
          apiKey: login.user?.apiKey,
          user: login.user,
        });
      }
      window.location.href = "/";
    } catch (e: any) {
      setError(e.message || "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "3rem auto" }}>
      <div className="page-header">
        <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p>
          JWT + API key auth. Local mode (`USE_DATABASE=false`) does not require
          login for API calls.
        </p>
      </div>

      <div className="panel-box">
        {mode === "register" && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </div>
        )}
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ width: "100%" }}
          />
        </div>
        {error && <div className="alert-error">{error}</div>}
        <button className="btn" onClick={submit} disabled={loading} style={{ width: "100%" }}>
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
        <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
          {mode === "login" ? (
            <>
              No account?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); }}>
                Register
              </a>
            </>
          ) : (
            <>
              Have an account?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); }}>
                Sign in
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
