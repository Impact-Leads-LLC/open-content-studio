import { C, HEAD, card } from "../../lib/ui";
import { BRAND } from "../../lib/brand";

// The frame for the sign-in and invite pages: navy page, one white card, the studio's name on top.
export default function AuthCard({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: C.navy, display: "grid", placeItems: "center", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400, display: "grid", gap: 18 }}>
        <div style={{ color: "#fff", font: `800 20px ${HEAD}`, letterSpacing: "-0.02em", textAlign: "center" }}>{BRAND}<span style={{ color: C.accent }}>.</span></div>
        <div style={{ ...card, padding: 28, display: "grid", gap: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, font: `800 26px/1.15 ${HEAD}`, letterSpacing: "-0.025em", color: C.ink }}>{title}</h1>
            {lead && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.text }}>{lead}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
