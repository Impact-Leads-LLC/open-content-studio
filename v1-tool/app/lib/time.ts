// "20:37", "1:02:05" or "1237.5" to seconds; NaN when it can't be read.
export const secs = (t: string | null | undefined) => {
  const s = String(t ?? "").trim();
  if (!s) return NaN;
  if (!s.includes(":")) return Number(s);
  return s.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
};
export const clock = (s: number) => {
  if (!Number.isFinite(s)) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = (s % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};
