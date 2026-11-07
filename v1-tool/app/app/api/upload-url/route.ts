import { storage, safeError, BUCKET } from "../../../lib/supabase";

export const runtime = "nodejs";

// A one-time link the browser uses to upload straight to the private bucket. Files never pass through this server.
export async function POST(req: Request) {
  try {
    const { name, episodeId, sheetFor, full, feed, postImage } = await req.json();
    if (!name || typeof name !== "string") return Response.json({ error: "Missing file name." }, { status: 400 });
    if (episodeId && !/^[0-9a-f-]{36}$/.test(episodeId)) return Response.json({ error: "Bad episode id." }, { status: 400 });
    if (sheetFor && !/^render-\d+$/.test(sheetFor)) return Response.json({ error: "Bad render id." }, { status: 400 });
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90);
    if ((full || feed || postImage) && !episodeId) return Response.json({ error: "Episode footage belongs to an episode." }, { status: 400 });
    // A reel's contact sheet sits next to its render; a full episode, the camera feeds and an image attached to one post
    // get their own folders; everything else is material.
    const path = sheetFor ? `renders/${sheetFor}-sheet.jpg` : full ? `episodes/${episodeId}/full/${Date.now()}-${safe}` : feed ? `episodes/${episodeId}/feeds/${Date.now()}-${safe}` : postImage ? `episodes/${episodeId}/post-images/${Date.now()}-${safe}` : `${episodeId ? `episodes/${episodeId}` : "uploads"}/${Date.now()}-${safe}`;
    const { data, error } = await storage().createSignedUploadUrl(path, { upsert: !!sheetFor });
    if (error) throw error;
    // Big files use the resumable endpoint with the same one-time token. The direct storage host handles large uploads best.
    const tus = `${(process.env.SUPABASE_URL ?? "").replace(/\s+/g, "").replace(/\/$/, "").replace(/^https:\/\/([a-z0-9]+)\.supabase\.co$/, "https://$1.storage.supabase.co")}/storage/v1/upload/resumable/sign`;
    return Response.json({ path, signedUrl: data.signedUrl, token: data.token, bucket: BUCKET, tus });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
