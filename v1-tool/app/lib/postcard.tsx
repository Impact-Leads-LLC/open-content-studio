import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HANDLE, OWNER_FULL, PALETTE, SHOW, TAGLINE } from "./brand";

// The graphic that goes out with a text post: one 1080x1350 card with the post's point in big type, drawn here with
// Next's image renderer, so no cloud machine. Two looks that take turns so the feed doesn't repeat: the brand's primary
// colour (harbor blue by default) and light. The accent (yellow by default) marks the one key word, nothing else. The
// words come from the post writer's <card> line, its key word marked *like this*. The owner's headshot shows in the
// corner when assets/postcard/head.jpg (or head.png) is there; otherwise their initials do.
export const W = 1080, H = 1350;
export type CardLook = "harbor" | "light";
const HARBOR = PALETTE.primary, SOFT = "#f4f6f8", INK = PALETTE.ink, TEXT = "#3a4651", MIST = "#eef2f5", YEL = PALETTE.accent;

const dir = path.join(process.cwd(), "assets", "postcard");
let cache: { fonts: { name: string; data: Buffer; weight: 400 | 600 | 900; style: "normal" }[]; head: string | null } | null = null;
function load() {
  if (cache) return cache;
  const f = (n: string) => readFileSync(path.join(dir, n));
  cache = {
    fonts: [
      { name: "Libre Franklin", data: f("LibreFranklin-Black.ttf"), weight: 900, style: "normal" },
      { name: "Poppins", data: f("Poppins-Regular.ttf"), weight: 400, style: "normal" },
      { name: "Poppins", data: f("Poppins-SemiBold.ttf"), weight: 600, style: "normal" },
    ],
    head: (() => {
      for (const [n, type] of [["head.jpg", "jpeg"], ["head.png", "png"]] as const) {
        try { return `data:image/${type};base64,${f(n).toString("base64")}`; } catch { /* no headshot */ }
      }
      return null;
    })(),
  };
  return cache;
}

// "Most people race to *1,000 dials*. Pick 150" -> the words in order, the key words kept together as one piece (one
// accent mark, never split), and punctuation glued to the word before it. No asterisks: no key word.
export function cardWords(line: string) {
  const out: { w: string; key: boolean; glue: boolean }[] = [];
  let key = false;
  for (const part of line.replace(/\s+/g, " ").trim().split(/(\*)/)) {
    if (part === "*") { key = !key; continue; }
    if (key) { if (part.trim()) out.push({ w: part.trim(), key: true, glue: false }); continue; }
    for (const w of part.split(" ").filter(Boolean)) out.push({ w, key: false, glue: /^[.,!?;:)]+$/.test(w) });
  }
  return out;
}
const INITIALS = OWNER_FULL.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
// The board's faint dot grid, as a pattern layer (the image renderer doesn't repeat CSS gradients).
const dots = (fill: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="d" width="38" height="38" patternUnits="userSpaceOnUse"><circle cx="19" cy="19" r="2.4" fill="${fill}"/></pattern></defs><rect width="100%" height="100%" fill="url(#d)"/></svg>`).toString("base64")}`;
// The card's line from a post when the writer gave none: its first sentence, up to 14 words.
export const fallbackLine = (text: string) => (text.replace(/\s+/g, " ").trim().match(/^[^.!?]*[.!?]?/)?.[0] ?? "").split(" ").slice(0, 14).join(" ");
// Big for a few words, smaller as the line runs long; capitals in Libre Franklin Black, like the boards.
const sizeFor = (n: number, chars: number) => (n <= 4 && chars <= 26 ? 150 : n <= 7 && chars <= 46 ? 118 : n <= 10 && chars <= 64 ? 98 : chars <= 90 ? 84 : 72);

export async function renderCard(opts: { line: string; look: CardLook; label?: string | null }) {
  const { fonts, head } = load();
  const words = cardWords(opts.line);
  const chars = words.reduce((a, x) => a + x.w.length + 1, 0);
  const size = sizeFor(words.length, chars);
  const harbor = opts.look === "harbor";
  const fg = harbor ? "#ffffff" : INK;
  const sub = harbor ? MIST : TEXT;
  const gap = size * 0.26;
  const card = (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", padding: "96px 88px 84px", backgroundColor: harbor ? HARBOR : SOFT, position: "relative" }}>
      <img src={dots(harbor ? "rgba(255,255,255,0.09)" : "rgba(12,26,36,0.09)")} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }} />
      {opts.label ? (
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", backgroundColor: "#0f0f0f", color: "#ffffff", fontFamily: "Libre Franklin", fontWeight: 900, fontSize: 26, letterSpacing: 1.8, textTransform: "uppercase", padding: "14px 22px", borderRadius: 6 }}>{opts.label}</div>
        </div>
      ) : null}
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Libre Franklin", fontWeight: 900, fontSize: size, lineHeight: 1.0, letterSpacing: -size * 0.025, textTransform: "uppercase", color: fg }}>
          {words.map((x, i) => {
            const right = words[i + 1]?.glue ? 0 : gap;
            return (
              <span key={i} style={x.key
                ? harbor ? { color: YEL, marginRight: right, marginBottom: size * 0.1 } : { backgroundColor: YEL, padding: `0 ${size * 0.08}px`, marginRight: right ? gap * 0.7 : 0, marginBottom: size * 0.1 }
                : { marginRight: right, marginBottom: size * 0.1 }}>{x.w}</span>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {head
            ? <img src={head} width={128} height={128} style={{ borderRadius: 64, border: `5px solid ${harbor ? "#ffffff" : INK}`, marginRight: 26 }} />
            : <div style={{ display: "flex", width: 128, height: 128, borderRadius: 64, border: `5px solid ${harbor ? "#ffffff" : INK}`, marginRight: 26, alignItems: "center", justifyContent: "center", fontFamily: "Libre Franklin", fontWeight: 900, fontSize: 46, color: fg }}>{INITIALS}</div>}
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Poppins" }}>
            <div style={{ display: "flex", fontWeight: 600, fontSize: 34, color: fg }}>{OWNER_FULL}</div>
            <div style={{ display: "flex", fontWeight: 400, fontSize: 26, color: sub }}>{TAGLINE || `Host of ${SHOW}`}</div>
          </div>
        </div>
        {HANDLE ? <div style={{ display: "flex", fontFamily: "Poppins", fontWeight: 400, fontSize: 26, color: sub }}>{HANDLE}</div> : null}
      </div>
    </div>
  );
  const res = new ImageResponse(card, { width: W, height: H, fonts });
  return Buffer.from(await res.arrayBuffer());
}
