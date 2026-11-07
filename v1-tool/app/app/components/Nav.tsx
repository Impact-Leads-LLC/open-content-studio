"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { C, HEAD, changed } from "../../lib/ui";
import { OWNER, COACH, BRAND } from "../../lib/brand";

// Three places the team works; the setup pages sit under one menu.
const LINKS = [["/", "Calendar"], ["/episodes", "Episodes"], ["/queue", `${OWNER}'s queue`]] as const;
const SETUP = [["/podcast", "Podcast"], ["/coach", COACH], ["/leads", "Lead magnets"]] as const;

const OPEN = ["/login", "/join"];

export default function Nav() {
  const path = usePathname();
  const [waiting, setWaiting] = useState<[number, number]>([0, 0]);
  const [who, setWho] = useState("");
  useEffect(() => {
    if (OPEN.includes(path)) return;
    // The signed-in person is who's working; the rest of the page reads it through who() and isOwner().
    fetch("/api/auth/me").then((r) => r.json()).then((r) => { if (!r.me) return; setWho(r.me.name); try { localStorage.setItem("studio-who", r.me.name); localStorage.setItem("studio-role", r.me.role ?? "team"); } catch {} changed(); }).catch(() => {});
    // Everything waiting on the owner: pieces to approve plus the coach's questions.
    const load = () => fetch("/api/queue?count=1").then((r) => r.json()).then((r) => setWaiting([r.waiting ?? 0, r.questions ?? 0])).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("studio:changed", load);
    return () => { clearInterval(t); window.removeEventListener("studio:changed", load); };
  }, [path]);
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); try { localStorage.removeItem("studio-who"); localStorage.removeItem("studio-role"); } catch {} window.location.href = "/login"; };
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  if (OPEN.includes(path)) return null;
  return (
    <header className="topnav" style={{ background: C.navy, padding: "0 24px", minHeight: 64, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 20 }}>
      <a href="/" className="tn-brand" style={{ color: "#fff", font: `800 18px ${HEAD}`, letterSpacing: "-0.02em", textDecoration: "none", whiteSpace: "nowrap" }}>{BRAND}<span style={{ color: C.accent }}>.</span></a>
      <nav className="tn-links" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {LINKS.map(([href, text]) => (
          <a key={href} href={href} style={{ color: on(href) ? "#fff" : "#c0ccd6", background: on(href) ? C.navy2 : "transparent", font: `600 14px ${HEAD}`, textDecoration: "none", padding: "9px 12px", borderRadius: 6, display: "inline-flex", gap: 8, alignItems: "center" }}>
            {text}
            {href === "/queue" && waiting[0] + waiting[1] > 0 && <span className="pulse" title={`${waiting[0]} to approve, ${waiting[1]} to answer`} style={{ minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, background: C.accent, color: C.accentInk, font: `800 12px/22px ${HEAD}`, textAlign: "center" }}>{waiting[0] + waiting[1]}</span>}
          </a>
        ))}
      </nav>
      <details className="tn-setup" style={{ position: "relative", marginLeft: -16 }}>
        <summary style={{ listStyle: "none", color: SETUP.some(([h]) => on(h)) ? "#fff" : "#c0ccd6", font: `600 14px ${HEAD}`, padding: "9px 12px", borderRadius: 6, cursor: "pointer" }}>Setup ▾</summary>
        <div className="tn-menu" style={{ position: "absolute", top: "100%", left: 0, minWidth: 180, background: "#fff", borderRadius: 6, boxShadow: "0 12px 28px rgba(11,27,39,0.25)", padding: 6, zIndex: 30 }}>
          {SETUP.map(([href, text]) => <a key={href} href={href} style={{ display: "block", padding: "10px 12px", borderRadius: 4, color: C.ink, textDecoration: "none", font: `600 14px ${HEAD}` }}>{text}</a>)}
          {/* on a phone the right side of the bar is hidden, so these live here */}
          <a href="/episodes?new=1" className="tn-phone" style={{ padding: "10px 12px", borderRadius: 4, color: C.ink, textDecoration: "none", font: `600 14px ${HEAD}` }}>New episode</a>
          {who && <button onClick={signOut} className="tn-phone" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 4, border: 0, borderTop: `1px solid ${C.line}`, background: "none", color: C.muted, cursor: "pointer", font: `600 14px ${HEAD}` }}>Sign out {who}</button>}
        </div>
      </details>
      <div className="tn-right" style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        {who && (
          <span style={{ color: C.onNavy, fontSize: 12.5, display: "flex", gap: 10, alignItems: "center" }}>
            <b style={{ color: "#fff", font: `600 13px ${HEAD}` }}>{who}</b>
            <button onClick={signOut} style={{ background: "none", border: 0, padding: 0, color: C.onNavy, font: `600 12.5px ${HEAD}`, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Sign out</button>
          </span>
        )}
        <a href="/episodes?new=1" style={{ minHeight: 38, padding: "0 14px", borderRadius: 6, border: "1.5px solid rgba(255,255,255,.75)", color: "#fff", font: `700 14px ${HEAD}`, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>New episode</a>
      </div>
    </header>
  );
}
