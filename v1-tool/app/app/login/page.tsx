"use client";
import { useState, type FormEvent } from "react";
import AuthCard from "../components/AuthCard";
import { C, btn, input, label } from "../../lib/ui";
import { OWNER } from "../../lib/brand";

// Back to the page that sent them here, never to another site.
const nextPath = () => { const n = new URLSearchParams(window.location.search).get("next"); return n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/"; };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).then((x) => x.json()).catch(() => ({ error: "Network error. Try again." }));
    if (r.error) { setBusy(false); return setError(r.error); }
    window.location.href = nextPath();
  }
  return (
    <AuthCard title="Sign in">
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}><span style={label}>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </label>
        <label style={{ display: "grid", gap: 6 }}><span style={label}>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        </label>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: C.warn }}>{error}</p>}
        <button type="submit" style={{ ...btn, minHeight: 48 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>No account yet? {OWNER} sends an invite link.</p>
    </AuthCard>
  );
}
