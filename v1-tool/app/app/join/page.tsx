"use client";
import { useEffect, useState, type FormEvent } from "react";
import AuthCard from "../components/AuthCard";
import { C, btn, input, label } from "../../lib/ui";
import { BRAND } from "../../lib/brand";

// The invite link: shows who it's for, and the person sets their own password (it's never sent to anyone else).
export default function Join() {
  const [token, setToken] = useState("");
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [gone, setGone] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    fetch(`/api/auth/join?token=${encodeURIComponent(t)}`).then((x) => x.json()).then((r) => (r.error ? setGone(r.error) : setWho(r))).catch(() => setGone("Network error. Reload the page."));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true); setError("");
    const r = await fetch("/api/auth/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }).then((x) => x.json()).catch(() => ({ error: "Network error. Try again." }));
    if (r.error) { setBusy(false); return setError(r.error); }
    window.location.href = "/";
  }
  if (gone) return <AuthCard title="This link doesn't work" lead={gone}><a href="/login" style={{ ...btn, minHeight: 48 }}>Go to sign in</a></AuthCard>;
  if (!who) return <AuthCard title="One moment" lead="Checking your invite…">{null}</AuthCard>;
  return (
    <AuthCard title={`Welcome, ${who.name}`} lead={`Set a password for ${BRAND}. You'll sign in with your email and this password from now on.`}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}><span style={label}>Email</span>
          <input type="email" autoComplete="username" value={who.email} readOnly style={{ ...input, background: C.soft, color: C.muted }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}><span style={label}>New password</span>
          <input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
          <span style={{ fontSize: 12, color: C.muted }}>At least 10 characters.</span>
        </label>
        <label style={{ display: "grid", gap: 6 }}><span style={label}>Type it again</span>
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} style={input} />
        </label>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: C.warn }}>{error}</p>}
        <button type="submit" style={{ ...btn, minHeight: 48 }} disabled={busy}>{busy ? "Setting it up…" : "Set password and sign in"}</button>
      </form>
    </AuthCard>
  );
}
