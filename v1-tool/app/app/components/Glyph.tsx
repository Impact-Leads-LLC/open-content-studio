import { PALETTE } from "../../lib/brand";

// Two-tone brand glyphs: ink line work with one element in the brand's accent colour.
const ACCENT = PALETTE.accent;

export default function Glyph({ kind, size = 20, light = false }: { kind: string; size?: number; light?: boolean }) {
  const ink = light ? "#ffffff" : "#0c1a24";
  const p = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, style: { flex: "none", display: "block" } } as const;
  const line = { fill: "none", stroke: ink, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "reel") return <svg {...p}><rect x="6" y="2.5" width="12" height="19" rx="2.6" {...line} /><path d="M10.4 9v6l4.8-3z" fill={ACCENT} /></svg>;
  if (kind === "carousel") return <svg {...p}><rect x="2.8" y="6.5" width="10.5" height="13" rx="1.8" {...line} /><rect x="9.2" y="3.5" width="12" height="15" rx="1.8" fill={ACCENT} /></svg>;
  if (kind === "post") return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2.2" {...line} /><path d="M8 8.2h8" stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round" /><path d="M8 12.4h8M8 16h5" {...line} /></svg>;
  if (kind === "episode" || kind === "microphone") return <svg {...p}><rect x="9" y="2.8" width="6" height="11" rx="3" fill={ACCENT} /><path d="M5.8 11a6.2 6.2 0 0 0 12.4 0M12 17.4v3.6M8.8 21h6.4" {...line} /></svg>;
  if (kind === "coach") return <svg {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z" {...line} /><circle cx="12" cy="9.5" r="2.4" fill={ACCENT} /></svg>;
  if (kind === "queue") return <svg {...p}><rect x="3.5" y="4" width="17" height="16" rx="2.4" {...line} /><path d="M7.5 9h9M7.5 13h6" {...line} /><circle cx="17" cy="16" r="2.6" fill={ACCENT} /></svg>;
  if (kind === "pencil") return <svg {...p}><path d="M14.6 5.6l3.8 3.8L8.6 19.2l-4.8.9.9-4.8z" {...line} /><path d="M14.6 5.6l1.8-1.8a1.5 1.5 0 0 1 2.1 0l1.7 1.7a1.5 1.5 0 0 1 0 2.1l-1.8 1.8z" fill={ACCENT} /></svg>;
  if (kind === "calendar") return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.4" {...line} /><path d="M8 3v4M16 3v4M3.5 10h17" {...line} /><rect x="13.5" y="13.5" width="4" height="4" rx="1" fill={ACCENT} /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="8" {...line} /><circle cx="12" cy="12" r="3" fill={ACCENT} /></svg>;
}

const SHORT: Record<string, string> = { Instagram: "IG", LinkedIn: "LI", TikTok: "TT", "YouTube Shorts": "YT" };
export function Channels({ list, light = false }: { list: string[]; light?: boolean }) {
  if (!list?.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 3 }} title={list.join(", ")}>
      {list.map((c) => <span key={c} style={{ font: "700 9.5px 'Libre Franklin', Arial", letterSpacing: "0.04em", padding: "2px 4px", borderRadius: 3, border: `1px solid ${light ? "rgba(255,255,255,0.5)" : "rgba(12,26,36,0.25)"}`, color: light ? "#fff" : "#3a4651" }}>{SHORT[c] ?? c}</span>)}
    </span>
  );
}
