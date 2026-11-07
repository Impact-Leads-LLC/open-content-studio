"use client";
import { useEffect, useState } from "react";
import { C, HEAD, btn, card, input, link } from "../../lib/ui";
import { HANDLE_FIELDS, TAG_IN_TEXT, type Handles } from "../../lib/guests";
import { LABEL } from "../../lib/platforms";

// The guest's handles (tagged where a caption names them, invited as an Instagram collaborator) and the episode's own
// link (posted as the first comment where a caption points there).
export default function GuestCard({ guest, handles, link: own, effective, busy, onSave }: {
  guest: string | null; handles: Handles; link: string | null; effective: string | null; busy: boolean;
  onSave: (b: { guest_handles: Handles; link: string }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState<Handles>(handles);
  const [l, setL] = useState(own ?? "");
  useEffect(() => { if (!open) { setH(handles); setL(own ?? ""); } }, [open, JSON.stringify(handles), own]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = guest || "the guest";
  const tagged = TAG_IN_TEXT.filter((n) => handles[n]);
  const summary = [
    tagged.length ? `Tags ${who} on ${tagged.map((n) => LABEL[n]).join(", ")}` : `No handles for ${who} yet, so nobody is tagged`,
    handles.instagram ? `Instagram invite to ${handles.instagram}` : "",
    effective ? "episode link in first comments" : "no episode link yet",
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ font: `700 13px ${HEAD}` }}>Guest and links</b>
        <span style={{ fontSize: 13.5, color: C.text, flex: "1 1 240px" }}>{summary}.</span>
        <button style={{ ...link, fontSize: 13 }} onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</button>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {HANDLE_FIELDS.map(({ net, label, hint }) => (
              <label key={net} style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>{label}
                <input value={h[net] ?? ""} onChange={(e) => setH({ ...h, [net]: e.target.value })} placeholder={hint} style={{ ...input, fontWeight: 400 }} />
              </label>
            ))}
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>Episode link
              <input value={l} onChange={(e) => setL(e.target.value)} placeholder={effective && !own ? effective : "https:// once it's published"} style={{ ...input, fontWeight: 400 }} />
            </label>
          </div>
          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            Each @handle goes in where a caption first names {who} on that network. On Instagram, reels and carousels also invite {who} as a collaborator, so the post shows on their profile once they accept. LinkedIn tags are added by hand; the profile link here is for that. The episode link goes in the first comment wherever a caption says the link is there{effective && !own ? " (the published episode's link is used until one is put here)" : ""}.
          </span>
          <div><button style={btn} disabled={busy} onClick={async () => { if (await onSave({ guest_handles: h, link: l })) setOpen(false); }}>Save</button></div>
        </div>
      )}
    </div>
  );
}
