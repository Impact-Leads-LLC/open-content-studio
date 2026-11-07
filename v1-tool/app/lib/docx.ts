// A Word transcript (.docx) becomes a plain .txt in the browser before it's uploaded, in the shape the app reads
// (lib/transcript.ts): "Name (mm:ss)" over each paragraph. Exports like "Alex: [00:01:00] So…" name the speaker where
// it changes and stamp the time every so often; a paragraph without a name carries on the turn before, and its time is
// spread between the stamps by word count (rough, like Riverside's .txt).

export const DOCX = /\.docx$/i;

// The paragraphs of word/document.xml. A .docx is a zip; the browser's DecompressionStream inflates the one entry.
export async function docxParagraphs(file: Blob): Promise<string[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("This isn't a Word file the app can open. Save it as .docx or .txt and try again.");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  for (let n = 0; n < count && v.getUint32(at, true) === 0x02014b50; n++) {
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), note = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extra + note;
    if (name !== "word/document.xml") continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = buf.slice(start, start + size);
    const xml = method === 0 ? new TextDecoder().decode(raw)
      : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    return paragraphs(xml);
  }
  throw new Error("No text found in this Word file.");
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);

export function paragraphs(xml: string): string[] {
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => {
    let t = "";
    for (const m of p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/>/g)) t += m[1] !== undefined ? unescape(m[1]) : " ";
    return t.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

const STAMP = /\[((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)\]/g;
// "Alex:", "Sam Rivera (2):", "[00:01:00] Alex:", up to four capitalised words
const NAME = /^(?:\[[\d:.,]+\]\s*)?((?:[A-Z][\w.'’-]*)(?: [A-Z][\w.'’-]*){0,3})(?: \(\d+\))?\s*:\s*/;
const toSecs = (t: string) => t.replace(",", ".").split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const stamp = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
};

export function asTranscript(paras: string[]): string {
  type Para = { who: string; text: string; first: number };
  const out: Para[] = [], anchors: { w: number; t: number }[] = [];
  let who = "", words = 0;
  for (const p of paras) {
    const named = p.match(NAME);
    if (named) who = named[1];
    // a short line before anyone speaks, with no time on it, is the document's title
    if (!who && !/\[[\d:.,]+\]/.test(p) && p.split(" ").length < 12) continue;
    const body = named ? p.slice(named[0].length) : p;
    const first = words;
    let text = "";
    for (const part of body.split(STAMP).map((s, i) => ({ s, i }))) {
      if (part.i % 2) { anchors.push({ w: words, t: toSecs(part.s) }); continue; }
      const ws = part.s.trim().split(/\s+/).filter(Boolean);
      words += ws.length;
      if (ws.length) text += (text ? " " : "") + ws.join(" ");
    }
    if (text) out.push({ who: who || "Speaker", text, first });
  }
  // the time at a word: between the stamps around it, else 2.5 words a second on from the last one
  const at = (w: number) => {
    const before = [...anchors].reverse().find((a) => a.w <= w), after = anchors.find((a) => a.w > w);
    if (before && after && after.t > before.t) return before.t + ((w - before.w) / (after.w - before.w)) * (after.t - before.t);
    if (before) return before.t + (w - before.w) / 2.5;
    if (after) return Math.max(0, after.t - (after.w - w) / 2.5);
    return w / 2.5;
  };
  return out.map((p) => `${p.who} (${stamp(at(p.first))})\n${p.text}\n`).join("\n");
}

// The .docx as a .txt File, ready for the normal upload.
export async function docxTranscript(file: File): Promise<File> {
  const text = asTranscript(await docxParagraphs(file));
  if (!text.trim()) throw new Error(`No transcript text found in ${file.name}.`);
  return new File([text], file.name.replace(DOCX, ".txt"), { type: "text/plain" });
}
