import { safeError } from "../../../../lib/supabase";
import { pstore } from "../../../../lib/podcast-server";

export const runtime = "nodejs";

// A one-time link for artwork or a transcript, straight into the public podcast bucket. Audio goes through the studio's
// own upload and the audio job instead, so every episode's sound gets the same treatment.
export async function POST(req: Request) {
  try {
    const { name, episode } = await req.json();
    if (typeof name !== "string" || !/\.(png|jpe?g|srt|vtt|txt)$/i.test(name)) return Response.json({ error: "Artwork is a JPG or PNG; a transcript is .srt, .vtt or .txt." }, { status: 400 });
    if (episode && !/^[0-9a-f-]{36}$/.test(episode)) return Response.json({ error: "Bad episode id." }, { status: 400 });
    const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-60);
    const kind = /\.(srt|vtt|txt)$/i.test(name) ? "transcript" : "art";
    const path = episode ? `episodes/${episode}/${kind}-${Date.now().toString(36)}-${safe}` : `art/show-${Date.now().toString(36)}-${safe}`;
    const { data, error } = await pstore().createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ path, signedUrl: data.signedUrl });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
