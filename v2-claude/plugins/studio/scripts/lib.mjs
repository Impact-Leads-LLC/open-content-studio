// Shared helpers for the studio scripts. Node 20+, no npm packages: everything here uses Node's own modules, the
// ffmpeg and ffprobe on the computer, and a Chrome-type browser run headless from the command line.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FONTS = path.join(KIT, "assets", "fonts");
export const TEMPLATES = path.join(KIT, "templates");

export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

// --key value, --key=value, --flag, and positional arguments
export function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) { o[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2), n = argv[i + 1];
      if (n === undefined || n.startsWith("--")) o[k] = true;
      else { o[k] = n; i++; }
    } else o._.push(a);
  }
  return o;
}

export const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
export function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Couldn't read ${p}: ${e.message}`); }
}
export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, p);
}
export const readText = (p, fallback = "") => { try { return fs.readFileSync(p, "utf8"); } catch { return fallback; } };

// The studio folder: the folder holding brand/ and library/. Found from --studio, then by walking up from a start
// folder (an episode folder lives inside it), then ./studio.
export function findStudio(start = process.cwd(), explicit) {
  const ok = (d) => exists(path.join(d, "brand", "settings.json")) || exists(path.join(d, "brand", "brief.md"));
  if (explicit) {
    const d = path.resolve(explicit);
    if (ok(d)) return d;
    if (ok(path.join(d, "studio"))) return path.join(d, "studio");
    die(`No studio folder at ${d} (looked for brand/settings.json). Run studio-setup first.`);
  }
  let d = path.resolve(start);
  for (let i = 0; i < 12; i++) {
    if (ok(d)) return d;
    if (ok(path.join(d, "studio"))) return path.join(d, "studio");
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

const DEFAULT_PALETTE = {
  colors: { board: "#1E4E6E", accent: "#FFC530", ink: "#0C1A24", text: "#3A4651", soft: "#F4F6F8", mist: "#E8EEF3", deep: "#1E4E6E", on_accent: "#0C1A24", chip: "#0F0F0F" },
  fonts: {
    head: { family: "Libre Franklin", file: "LibreFranklin-VF.ttf", weight: 800 },
    body: { family: "Poppins", files: { 400: "Poppins-Regular.ttf", 500: "Poppins-Medium.ttf", 600: "Poppins-SemiBold.ttf" } },
    caption: { family: "Libre Franklin Black", file: "LibreFranklin-Black.ttf" },
  },
  logo: null,
  headshot: null,
  dots: true,
};
const DEFAULT_SETTINGS = {
  identity: { name: "Your Name", first_name: "You", coach_name: "Coach", name_line: "", handle: "", brand: "" },
  next_step: { call_name: "free call", cta_label: "Book a free call", cta_where: "Link in bio", booking_url: "" },
  lead_magnets: [],
  networks: { reel: ["instagram", "tiktok", "youtube", "linkedin", "facebook"], carousel: ["instagram", "linkedin", "facebook"], post: ["linkedin", "facebook", "threads"] },
  main_network: "linkedin",
  scheduler: { name: "none", template: null },
  mix: "full",
  checkpoint: "plan",
  transcription: { engine: "whisper.cpp", model: "", language: "en" },
  library: { connector: null, notes: "" },
  pictures: { fal: false, model: "fal-ai/flux-pro/v1.1" },
  retention: { renders_days: 7, action: "delete", move_to: null, raw_footage: "after_all_posted", raw_days: 7, copy_video: false },
};

const merge = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b === undefined ? a : b;
  const o = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && a && typeof a[k] === "object" && !Array.isArray(a[k]) ? merge(a[k], v) : v;
  return o;
};

// A file the brand names: the studio's own (studio/assets/...), a path relative to the studio, an absolute path, or one
// of the kit's fonts.
export function resolveAsset(studio, p, kind = "file") {
  if (!p) return null;
  const tries = [p, studio && path.join(studio, p), studio && path.join(studio, "assets", p), studio && path.join(studio, "assets", "fonts", p), kind === "font" ? path.join(FONTS, path.basename(p)) : null].filter(Boolean);
  for (const t of tries) if (exists(t) && fs.statSync(t).isFile()) return path.resolve(t);
  return null;
}

// Everything a renderer needs about the brand, with the defaults filled in (harbor blue and yellow when the member has
// no colours of their own).
export function brand(studio) {
  const palette = merge(DEFAULT_PALETTE, studio ? readJSON(path.join(studio, "brand", "palette.json"), {}) : {});
  const settings = merge(DEFAULT_SETTINGS, studio ? readJSON(path.join(studio, "brand", "settings.json"), {}) : {});
  const rhythm = studio ? readJSON(path.join(studio, "brand", "rhythm.json"), null) : null;
  const font = (f, fallback) => resolveAsset(studio, f, "font") ?? path.join(FONTS, fallback);
  const fonts = {
    head: { family: palette.fonts.head.family, file: font(palette.fonts.head.file, "LibreFranklin-VF.ttf"), weight: palette.fonts.head.weight ?? 800 },
    body: { family: palette.fonts.body.family, files: Object.fromEntries(Object.entries(palette.fonts.body.files ?? { 400: palette.fonts.body.file }).filter(([, f]) => f).map(([w, f]) => [w, font(f, "Poppins-Regular.ttf")])) },
    caption: { family: palette.fonts.caption.family, file: font(palette.fonts.caption.file, "LibreFranklin-Black.ttf") },
  };
  return {
    studio, palette, settings, rhythm, fonts,
    c: palette.colors,
    logo: resolveAsset(studio, palette.logo),
    headshot: resolveAsset(studio, palette.headshot),
    id: settings.identity,
    next: settings.next_step,
  };
}

// @font-face rules for a page rendered from a local file
export function fontCss(b) {
  const url = (f) => pathToFileURL(f).href;
  const rules = [`@font-face { font-family: '${b.fonts.head.family}'; src: url('${url(b.fonts.head.file)}'); font-weight: 100 900; }`];
  for (const [w, f] of Object.entries(b.fonts.body.files)) rules.push(`@font-face { font-family: '${b.fonts.body.family}'; src: url('${url(f)}'); font-weight: ${w}; }`);
  rules.push(`@font-face { font-family: 'StudioCaption'; src: url('${url(b.fonts.caption.file)}'); }`);
  return rules.join("\n");
}

// ---- text ----------------------------------------------------------------------------------------------------------
// The mechanical part of the voice gate: no em or en dashes in anything rendered.
export const clean = (s) => String(s ?? "").replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim();
export const esc = (s) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const escRaw = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slug = (s, n = 5) => String(s ?? "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, n).join("-") || "piece";
// "Most agencies race to *1,000 dials*" -> words, the starred part kept together and marked as the key
export function keyWords(line) {
  const out = [];
  let key = false;
  for (const part of clean(line).split(/(\*)/)) {
    if (part === "*") { key = !key; continue; }
    if (key) { if (part.trim()) out.push({ w: part.trim(), key: true, glue: false }); continue; }
    for (const w of part.split(" ").filter(Boolean)) out.push({ w, key: false, glue: /^[.,!?;:)]+$/.test(w) });
  }
  return out;
}

// ---- time ----------------------------------------------------------------------------------------------------------
// "12:04", "1:02:03", "12:04.5", "754.2" -> seconds
export function secs(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const p = s.split(":").map(Number);
  if (p.some((x) => Number.isNaN(x))) return NaN;
  return p.reduce((a, x) => a * 60 + x, 0);
}
const pad2 = (n) => String(n).padStart(2, "0");
export function clock(t, ms = false) {
  const neg = t < 0;
  let s = Math.abs(t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = ms ? (s % 60).toFixed(2).padStart(5, "0") : pad2(Math.floor(s % 60));
  return `${neg ? "-" : ""}${h ? `${h}:${pad2(m)}` : pad2(m)}:${sec}`;
}

// ---- programs on the computer ----------------------------------------------------------------------------------------
const exe = (n) => (process.platform === "win32" && !/\.exe$/i.test(n) ? `${n}.exe` : n);
export function which(name) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).concat([
    path.join(os.homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin",
    path.join(os.homedir(), "scoop", "shims"), "C:\\ffmpeg\\bin", "C:\\Program Files\\ffmpeg\\bin",
  ]);
  for (const d of dirs) {
    if (!d) continue;
    for (const n of [exe(name), name]) {
      const p = path.join(d, n);
      try { if (fs.statSync(p).isFile()) return p; } catch {}
    }
  }
  return null;
}
export function ffmpeg() {
  const p = process.env.FFMPEG_PATH && exists(process.env.FFMPEG_PATH) ? process.env.FFMPEG_PATH : which("ffmpeg");
  return p;
}
export function ffprobe() {
  const f = ffmpeg();
  const sib = f ? path.join(path.dirname(f), exe("ffprobe")) : null;
  return process.env.FFPROBE_PATH && exists(process.env.FFPROBE_PATH) ? process.env.FFPROBE_PATH : sib && exists(sib) ? sib : which("ffprobe");
}
export function need(bin, what) {
  if (!bin) die(`${what} isn't installed or isn't on the PATH. Run: node "${path.join(KIT, "scripts", "doctor.mjs")}" for the one-line install.`);
  return bin;
}
export function run(cmd, a, opts = {}) {
  const r = spawnSync(cmd, a, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${path.basename(cmd)} failed (${r.status}): ${(r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n")}`);
  return r;
}

export function probe(file) {
  const r = run(need(ffprobe(), "ffprobe (comes with ffmpeg)"), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(r.stdout);
  const v = (j.streams ?? []).find((s) => s.codec_type === "video");
  const a = (j.streams ?? []).find((s) => s.codec_type === "audio");
  let rot = 0;
  if (v) {
    const sd = (v.side_data_list ?? []).find((x) => x.rotation !== undefined);
    rot = Math.abs(Number(sd?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  }
  const w = v ? (rot === 90 ? v.height : v.width) : 0, h = v ? (rot === 90 ? v.width : v.height) : 0;
  return { duration: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0), width: w, height: h, hasVideo: !!v, hasAudio: !!a };
}

// a JPEG preview of an image or a video frame, through ffmpeg
export function jpeg(src, out, width = 540, at = null) {
  const f = ffmpeg();
  if (!f) return false;
  const a = ["-v", "error", "-y"];
  if (at !== null) a.push("-ss", String(at));
  a.push("-i", src, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", out);
  return run(f, a, { allowFail: true }).status === 0 && exists(out);
}
export function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
}

// ---- the browser ------------------------------------------------------------------------------------------------------
const HOME = os.homedir();
const globDir = (base, re) => { try { return fs.readdirSync(base).filter((n) => re.test(n)).map((n) => path.join(base, n)); } catch { return []; } };
// Find a headless-capable browser: CHROME_PATH, the HyperFrames headless shell, Playwright's browsers (including the one
// preinstalled in Claude's Cowork sandbox at /opt/pw-browsers), then Chrome, Edge or Chromium where they usually live.
export function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && exists(env)) return { path: env, shell: /headless[-_]shell/.test(env) };
  const shellNames = ["chrome-headless-shell", "chrome-headless-shell.exe"];
  // the HyperFrames shell first (npx hyperframes browser ensure puts it there), newest version first
  const hf = [];
  for (const ver of globDir(path.join(HOME, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), /./))
    for (const plat of globDir(ver, /./)) for (const n of shellNames) hf.push(path.join(plat, n));
  const hfShell = hf.filter((p) => exists(p)).sort().pop();
  if (hfShell) return { path: hfShell, shell: true };
  const shells = [];
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(HOME, "Library", "Caches", "ms-playwright"), path.join(HOME, ".cache", "ms-playwright"), path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright"), "/opt/pw-browsers"].filter(Boolean))
    for (const d of globDir(base, /^chromium_headless_shell-/)) for (const plat of globDir(d, /^chrome-/)) for (const n of shellNames) shells.push(path.join(plat, n));
  const shell = shells.filter((p) => exists(p)).sort().pop();
  if (shell) return { path: shell, shell: true };
  const full = [];
  if (exists("/opt/pw-browsers/chromium") && fs.statSync("/opt/pw-browsers/chromium").isFile()) full.push("/opt/pw-browsers/chromium");
  for (const base of ["/opt/pw-browsers", process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(HOME, ".cache", "ms-playwright"), path.join(HOME, "Library", "Caches", "ms-playwright")].filter(Boolean))
    for (const d of globDir(base, /^chromium-\d+/)) {
      full.push(path.join(d, "chrome-linux", "chrome"), path.join(d, "chrome-linux64", "chrome"), path.join(d, "chrome-win", "chrome.exe"),
        path.join(d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"), path.join(d, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"));
    }
  if (process.platform === "darwin") full.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
  if (process.platform === "win32") for (const v of ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]) if (process.env[v]) full.push(path.join(process.env[v], "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env[v], "Microsoft", "Edge", "Application", "msedge.exe"));
  for (const p of full) if (exists(p)) return { path: p, shell: false };
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "msedge"]) { const p = which(n); if (p) return { path: p, shell: false }; }
  return null;
}
export function needChrome() {
  const c = findChrome();
  if (!c) die(`No Chrome, Edge or Chromium found. Install Google Chrome, or run: npx hyperframes@0.8.143 browser ensure (or set CHROME_PATH).`);
  return c;
}
function chromeArgs(c, w, h) {
  const a = [c.shell ? "--headless" : "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files",
    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000", `--window-size=${w},${h}`, "--no-first-run", "--no-default-browser-check", "--mute-audio"];
  if (process.platform === "linux" && (process.getuid?.() === 0 || process.env.STUDIO_NO_SANDBOX)) a.push("--no-sandbox");
  return a;
}
function launch(c, a, capture) {
  return new Promise((resolve, reject) => {
    let profile = null;
    if (!c.shell) { profile = fs.mkdtempSync(path.join(os.tmpdir(), "studio-chrome-")); a = [`--user-data-dir=${profile}`, ...a]; }
    const p = spawn(c.path, a, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let out = "", err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => p.kill("SIGKILL"), 120000);
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (profile) try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
      resolve({ code, out, err });
    });
  });
}
// Screenshot a local HTML file at w x h.
export async function shoot(c, html, png, w, h) {
  try { fs.unlinkSync(png); } catch {}
  const r = await launch(c, [...chromeArgs(c, w, h), `--screenshot=${path.resolve(png)}`, pathToFileURL(path.resolve(html)).href], false);
  if (!exists(png)) throw new Error(`The browser wrote no image for ${html} (${r.err.trim().split("\n").slice(-2).join(" ")})`);
}
// The page's DOM after its scripts ran (the fit script marks overflow on <body>).
export async function dumpDom(c, html, w, h) {
  const r = await launch(c, [...chromeArgs(c, w, h), "--dump-dom", pathToFileURL(path.resolve(html)).href], true);
  return r.out;
}
// Run jobs a few at a time.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// A contact sheet: the images in a grid, drawn by the browser so no image library is needed.
export async function contactSheet(c, pngs, out, { cols = 3, tile = 360, ratio = 1350 / 1080, label = true } = {}) {
  if (!pngs.length) return null;
  const gap = 24, lh = label ? 40 : 0, th = Math.round(tile * ratio);
  const rows = Math.ceil(pngs.length / cols);
  const W = cols * tile + (cols + 1) * gap, H = rows * (th + lh) + (rows + 1) * gap;
  const html = path.join(path.dirname(out), `_sheet-${process.pid}.html`);
  const cells = pngs.map((p) => `<figure>${label ? `<figcaption>${escRaw(path.basename(p).replace(/\.[a-z]+$/i, ""))}</figcaption>` : ""}<img src="${pathToFileURL(path.resolve(p)).href}"></figure>`).join("");
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#e6e8eb;overflow:hidden}
main{display:grid;grid-template-columns:repeat(${cols},${tile}px);gap:${gap}px;padding:${gap}px}figure{width:${tile}px}figcaption{height:${lh}px;font:600 18px/40px Arial,sans-serif;color:#0c1a24}
img{display:block;width:${tile}px;height:${th}px;object-fit:cover;background:#fff}</style><main>${cells}</main>`);
  try { await shoot(c, html, out, W, H); } finally { try { fs.unlinkSync(html); } catch {} }
  return out;
}

// Shrinks marked text in the browser before the screenshot and records on <body> whether anything still overflows.
export const FIT = `<script>
document.fonts.ready.then(function () {
  var over = false;
  document.querySelectorAll('[data-w]').forEach(function (el) {
    var s = parseFloat(getComputedStyle(el).fontSize), min = +el.dataset.min || 40;
    while (el.scrollWidth > el.clientWidth + 1 && s > min) { s -= 2; el.style.fontSize = s + 'px'; }
    if (el.scrollWidth > el.clientWidth + 1) over = true;
  });
  document.querySelectorAll('[data-h]').forEach(function (el) {
    var lim = +el.dataset.h, stop = document.querySelector(el.dataset.stop || '#none');
    if (stop) lim = Math.min(lim, stop.getBoundingClientRect().top - 36);
    var sizes = (el.dataset.sizes || '').split(',').map(Number).filter(Boolean), i = 0;
    while (el.getBoundingClientRect().bottom > lim && i < sizes.length) { el.style.fontSize = sizes[i++] + 'px'; }
    if (el.getBoundingClientRect().bottom > lim || el.scrollWidth > el.clientWidth + 1) over = true;
  });
  document.body.setAttribute('data-overflow', over ? '1' : '0');
});
</script>`;
export const overflowOf = (dom) => (/data-overflow="1"/.test(dom) ? true : /data-overflow="0"/.test(dom) ? false : null);

// The episode's state file
export function loadPieces(ep) {
  const p = path.join(ep, "pieces.json");
  if (!exists(p)) die(`No pieces.json in ${ep}. Start the episode with: node pieces.mjs init "${ep}" --title "..."`);
  return { file: p, data: readJSON(p) };
}

export const STAGES = ["unaware", "problem", "solution", "product", "most"];
export const STAGE_LABEL = { unaware: "Unaware", problem: "Problem-aware", solution: "Solution-aware", product: "Product-aware", most: "Most aware" };
export const FUNNEL_OF = { unaware: "top", problem: "top", solution: "middle", product: "bottom", most: "bottom" };
export function cleanStage(v) {
  const s = String(v ?? "").toLowerCase().replace(/[\s_-]*aware(ness)?\b/, "").trim();
  return STAGES.includes(s) ? s : s === "un" ? "unaware" : null;
}

// ---- whisper.cpp ---------------------------------------------------------------------------------------------------
export const whisperCli = () => which("whisper-cli") ?? which("whisper-cpp");
export function findModel(explicit, language = "en") {
  if (explicit && exists(explicit)) return explicit;
  if (process.env.WHISPER_MODEL && exists(process.env.WHISPER_MODEL)) return process.env.WHISPER_MODEL;
  const H = os.homedir();
  const dirs = [path.join(H, ".cache", "whisper"), path.join(H, ".cache", "whisper.cpp"), path.join(H, ".cache", "hyperframes", "whisper", "models"), path.join(H, "whisper-models"), "/opt/homebrew/share/whisper-cpp", "/usr/local/share/whisper-cpp"];
  const found = [];
  for (const d of dirs) { try { for (const f of fs.readdirSync(d)) if (/^ggml-.*\.bin$/.test(f)) found.push(path.join(d, f)); } catch {} }
  const en = language === "en";
  const rank = (f) => { const n = path.basename(f); return (n.includes("small") ? 30 : n.includes("medium") ? 25 : n.includes("base") ? 20 : n.includes("large") ? 15 : 10) + (en === n.includes(".en") ? 5 : 0) - (!en && n.includes(".en") ? 100 : 0); };
  return found.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}


// ---- fonts -----------------------------------------------------------------------------------------------------------
// The names inside a .ttf/.otf (family and full name), so the caption burner (libass) is handed a name it will match.
export function fontNames(file) {
  try {
    const b = fs.readFileSync(file);
    const n = b.readUInt16BE(4);
    let off = -1;
    for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (b.toString("latin1", r, r + 4) === "name") { off = b.readUInt32BE(r + 8); break; } }
    if (off < 0) return {};
    const count = b.readUInt16BE(off + 2), strings = off + b.readUInt16BE(off + 4), out = {};
    for (let i = 0; i < count; i++) {
      const r = off + 6 + i * 12;
      const plat = b.readUInt16BE(r), id = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), at = strings + b.readUInt16BE(r + 10);
      if (![1, 2, 4, 16, 17].includes(id) || out[id]) continue;
      const raw = b.subarray(at, at + len);
      out[id] = plat === 3 || plat === 0 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
    }
    return { family: out[1], style: out[2], full: out[4], typoFamily: out[16], typoStyle: out[17] };
  } catch { return {}; }
}

// piece ids: r01, c01, p01...
export const PREFIX = { reel: "r", carousel: "c", post: "p" };
export function nextId(pieces, kind) {
  const p = PREFIX[kind] ?? "x";
  const n = Math.max(0, ...pieces.filter((x) => x.id.startsWith(p)).map((x) => Number(x.id.slice(1)) || 0)) + 1;
  return `${p}${String(n).padStart(2, "0")}`;
}

// the episode's length goes on pieces.json when it doesn't have one yet (it decides how many pieces a transcript gets)
export function noteMinutes(dir, minutes) {
  const f = path.join(dir, "pieces.json");
  if (!exists(f) || !Number.isFinite(minutes)) return;
  const j = readJSON(f, null);
  if (j?.episode && !j.episode.minutes) { j.episode.minutes = minutes; writeJSON(f, j); }
}
