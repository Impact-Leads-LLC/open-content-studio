"use client";
import { useRef, useState } from "react";
import { C, HEAD, ghost, link, label } from "../../lib/ui";
import { uploadFile } from "../../lib/upload";
import type { ViewPiece } from "../../lib/types";

// An image for one text post: it goes out with the post, and Instagram comes on with it. The episode's own material
// stays separate. Every post gets its branded graphic when it's written; "Make the graphic" makes one, "Try the other look" swaps the dark and light looks, and any image can replace it.
export default function ImagePick({ p, onSave }: { p: ViewPiece; onSave: (image: string | null) => Promise<unknown> | void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  async function upload(f?: File) {
    if (!f) return;
    if (!/^image\//.test(f.type)) return setErr("That isn't an image.");
    setBusy("Uploading…"); setErr("");
    try { await onSave(await uploadFile(f, { episodeId: p.episode_id, postImage: true })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  }
  const card = p.media?.card;
  async function makeCard() {
    setBusy("Making the graphic…"); setErr("");
    try {
      const look = card && p.image_url ? (card.look === "harbor" ? "light" : "harbor") : card?.look;
      const r = await fetch(`/api/pieces/${p.id}/card`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ look }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "The graphic didn't come out.");
      await onSave(j.image);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={label}>Image</span>
        <span style={{ fontSize: 12, color: C.muted }}>{p.image_url ? "goes out with the post, Instagram too" : "optional; with one, it can go to Instagram too"}</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {p.image_url && <img src={p.image_url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.line}` }} />}
        <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <button style={{ ...ghost, minHeight: 38 }} disabled={!!busy} onClick={makeCard}>{busy || (card && p.image_url ? "Try the other look" : "Make the graphic")}</button>
        {!busy && <button style={{ ...ghost, minHeight: 38 }} onClick={() => pick.current?.click()}>{p.image_url ? "Use a different image" : "Attach an image"}</button>}
        {p.image_url && !busy && <button style={{ ...link, fontSize: 13, color: C.muted }} onClick={() => onSave(null)}>Take it off</button>}
      </div>
      {err && <span style={{ fontSize: 12.5, color: C.warn, fontFamily: HEAD }}>{err}</span>}
    </div>
  );
}
