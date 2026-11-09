// Browser uploads straight to the private bucket. Small files go in one request; big ones (a full episode runs to
// gigabytes) go up in 6 MB pieces over Supabase's resumable protocol, so a dropped connection picks up where it stopped.
const CHUNK = 6 * 1024 * 1024;
const BIG = 45 * 1024 * 1024;
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fail(r: Response, what: string): Promise<never> {
  const text = await r.text().catch(() => "");
  if (r.status === 413 || /maximum allowed size|too large/i.test(text)) throw new Error("This file is bigger than the storage upload limit. Raise it in Supabase under Storage, Settings, then try again.");
  throw new Error(`${what} (${r.status}). ${text.slice(0, 160)}`);
}

export async function uploadFile(file: File, opts: { episodeId?: string; full?: boolean; feed?: boolean; postImage?: boolean }, onProgress?: (done: number, total: number) => void) {
  const r = await fetch("/api/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, ...opts }) }).then((x) => x.json());
  if (r.error) throw new Error(r.error);
  if (file.size <= BIG && !opts.full && !opts.feed) {
    const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", file);
    const up = await fetch(r.signedUrl, { method: "PUT", body: fd });
    if (!up.ok) await fail(up, "Upload failed");
    onProgress?.(file.size, file.size);
    return r.path as string;
  }
  const head: Record<string, string> = { "Tus-Resumable": "1.0.0", "x-signature": r.token };
  const meta = Object.entries({ bucketName: r.bucket, objectName: r.path, contentType: file.type || "video/mp4", cacheControl: "3600" }).map(([k, v]) => `${k} ${b64(v)}`).join(",");
  const made = await fetch(r.tus, { method: "POST", headers: { ...head, "Upload-Length": String(file.size), "Upload-Metadata": meta } });
  if (made.status !== 201) await fail(made, "Couldn't start the upload");
  const at = new URL(made.headers.get("Location") ?? "", r.tus).toString();
  let off = 0, tries = 0, renewed = 0;
  onProgress?.(0, file.size);
  while (off < file.size) {
    const p = await fetch(at, { method: "PATCH", headers: { ...head, "Upload-Offset": String(off), "Content-Type": "application/offset+octet-stream" }, body: file.slice(off, off + CHUNK) }).catch(() => null);
    if (p?.status === 204) {
      off = Number(p.headers.get("Upload-Offset") ?? off + CHUNK);
      tries = 0;
      onProgress?.(off, file.size);
      continue;
    }
    // The upload's token lasts two hours: a big file on a slow line gets a fresh one for the same file and carries on.
    if (p && [401, 403].includes(p.status) && renewed < 5) {
      const t = await fetch("/api/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resume: r.path }) }).then((x) => x.json()).catch(() => null);
      if (t?.token) {
        head["x-signature"] = t.token; renewed++;
        const h = await fetch(at, { method: "HEAD", headers: head }).catch(() => null);
        const o = h?.headers.get("Upload-Offset");
        if (o) off = Number(o);
        continue;
      }
    }
    // A refused or expired upload can't be resumed; anything else (a dropped connection, an offset mismatch) can.
    if (p && [401, 403, 404, 410, 413].includes(p.status)) await fail(p, "Upload stopped");
    if (++tries > 6) throw new Error("The connection kept dropping. Try the upload again.");
    await wait(2000 * tries);
    const h = await fetch(at, { method: "HEAD", headers: head }).catch(() => null);
    const o = h?.headers.get("Upload-Offset");
    if (o) off = Number(o);
  }
  return r.path as string;
}
