// The studio's names, colours and brain connection for this engine's Node scripts (every engine carries its own copy).
// The app writes a `studio` object into /tmp/job/context.json; every name in a prompt or on screen comes from here,
// with plain fallbacks when a field is empty. The brain is the member's own MCP server (BRAIN_MCP_URL + BRAIN_MCP_TOKEN).

export const PALETTE = { primary: "#1E4E6E", accent: "#FFC530", ink: "#0F1F2B", paper: "#FFFFFF", soft: "#EEF3F6" };
export const FONTS = { head: "Libre Franklin", body: "Poppins" };
const s = (v) => String(v ?? "").trim();
const HEX = /^#[0-9a-f]{6}$/i;

export function studioOf(ctx = {}) {
  const st = ctx && typeof ctx.studio === "object" && ctx.studio ? ctx.studio : {};
  const full = s(st.ownerFull) || s(st.owner);
  const owner = s(st.owner) || full.split(/\s+/)[0] || "";
  const palette = { ...PALETTE };
  for (const [k, v] of Object.entries(st.palette ?? {})) if (k in palette && HEX.test(s(v))) palette[k] = s(v).toUpperCase();
  const fonts = { ...FONTS };
  for (const [k, v] of Object.entries(st.fonts ?? {})) if (k in fonts && s(v)) fonts[k] = s(v);
  let handle = s(st.handle);
  if (handle && !handle.startsWith("@")) handle = `@${handle}`;
  return {
    owner: owner || "the host",
    ownerFull: full || "the host",
    coach: s(st.coach) || (owner ? `Coach ${owner}` : "the coach"),
    brand: s(st.brand) || full || "the studio",
    handle,
    show: s(st.show) || s(ctx?.episode?.show) || s(ctx?.show),
    audience: s(st.audience) || "the audience",
    website: s(st.website),
    bookingUrl: s(st.bookingUrl),
    timezone: s(st.timezone) || "UTC",
    palette,
    fonts,
    hasOwner: !!owner,
  };
}

// The brain documents the prompts name. The member's setup creates them with exactly these titles.
export const DOCS = {
  brief: "Brand Brief",
  voice: "Voice",
  guardrails: "Voice Guardrails",
  avoidAi: "Avoid AI Writing",
  review: "Review Standard",
  reel: "Reel Edits",
  episode: "Full Episode Edits",
  thumbs: "Thumbnails",
  carousels: "Carousels",
};

// The rules every prompt carries about what the brain may be used for.
export const brainRules = (st) => `Brain rules: a document marked confidential is never quoted. A document from ${st.owner}'s guest
spot on someone else's show is for ${st.owner}'s stories and voice, never the teaching. Ideas from a guest belong to the guest:
credit them by name and never present their advice as ${st.owner}'s own. Never invent a figure, a client, a quote or a claim.`;

// The model, and the brain connection every Claude call carries (null when this machine has no brain settings).
export const MODEL = s(process.env.CLAUDE_MODEL) || "claude-opus-5-5";
export function brain() {
  const url = s(process.env.BRAIN_MCP_URL), token = s(process.env.BRAIN_MCP_TOKEN);
  if (!url || !token) return null;
  return {
    mcp_servers: [{ type: "url", name: "brain", url, authorization_token: token }],
    tools: [{ type: "mcp_toolset", mcp_server_name: "brain" }],
  };
}
export const NO_BRAIN = "no Claude key or brain connection (ANTHROPIC_API_KEY, BRAIN_MCP_URL, BRAIN_MCP_TOKEN)";
