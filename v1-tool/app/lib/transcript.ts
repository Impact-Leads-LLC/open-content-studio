import { secs } from "./time";

export type Line = { t: number; who: string; text: string };

// An episode can have more than one transcript; this is the one everything reads. The camera tracks' own transcript
// first (exact times, and who is talking), then captions (.srt, .vtt: exact times), then the first .txt uploaded (a Word
// or text transcript: a time each turn or each minute, so the times in between are guesses).
export const TRACKS = /^\d+-camera-tracks-transcript\.txt$/i;
export function pickTranscript<T extends { name: string }>(files: T[]): T | undefined {
  const tx = files.filter((f) => /\.(txt|srt|vtt)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  return tx.filter((f) => TRACKS.test(f.name)).pop() ?? tx.find((f) => /\.(srt|vtt)$/i.test(f.name)) ?? tx[0];
}

// Riverside's .txt stamps each speaker turn ("Sam Rivera (20:37.112)"); .srt and .vtt stamp every caption. Long turns
// are split into sentences, with times spread by word count: close enough to find a cut point in the player.
export function parseTranscript(raw: string): { lines: Line[]; rough: boolean } {
  const text = raw.replace(/\r/g, "");
  if (/-->/.test(text)) return { lines: cues(text), rough: false };
  const turns: { t: number; who: string; parts: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const rows = block.split("\n");
    const m = rows[0].match(/^(.{1,60}?)\s*\(((?:\d+:)?\d{1,2}:\d{2}(?:\.\d+)?)\)\s*$/);
    if (m) { turns.push({ t: secs(m[2]), who: m[1].trim(), parts: [rows.slice(1).join(" ").trim()].filter(Boolean) }); continue; }
    if (turns.length && block.trim()) turns[turns.length - 1].parts.push(block.replace(/\n/g, " ").trim());
  }
  const lines: Line[] = [];
  turns.forEach((turn, i) => {
    const said = turn.parts.join(" ").split(/(?<=[.!?])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);
    const words = said.map((s) => s.split(/\s+/).length);
    const total = words.reduce((a, b) => a + b, 0) || 1;
    const next = turns[i + 1]?.t;
    const span = next && next > turn.t ? next - turn.t : total / 2.5;
    let w = 0;
    said.forEach((s, k) => { lines.push({ t: Math.round((turn.t + (w / total) * span) * 10) / 10, who: turn.who, text: s }); w += words[k]; });
  });
  return { lines, rough: true };
}

function cues(text: string): Line[] {
  const lines: Line[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const m = block.match(/((?:\d+:)?\d{1,2}:\d{2}[.,]\d+)\s*-->/);
    if (!m) continue;
    const after = block.indexOf("\n", block.indexOf("-->"));
    const body = after < 0 ? "" : block.slice(after + 1).replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim();
    if (!body) continue;
    const sp = body.match(/^([A-Z][\w .'-]{1,40}):\s+(.*)$/);
    lines.push({ t: secs(m[1].replace(",", ".")), who: sp ? sp[1] : "", text: sp ? sp[2] : body });
  }
  return lines;
}
