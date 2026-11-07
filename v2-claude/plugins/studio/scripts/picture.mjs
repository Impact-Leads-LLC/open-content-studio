#!/usr/bin/env node
// Optional: a generated picture for a carousel cover when there's no still from a video, made on fal with the member's
// own fal key (about 4 cents a picture on the default model). Objects and places only: never a person, a face or hands,
// never words, numbers or logos.
//
//   FAL_KEY=... node picture.mjs --prompt "a microphone on a wooden desk by a window" --out <deck>/cover.jpg [--model fal-ai/flux-pro/v1.1]
//
// The key comes from the FAL_KEY environment variable only: it is never written to a file or shown. On a Mac it can
// live in the Keychain (security add-generic-password -a "$USER" -s studio-fal-key -w) and be read for one command:
//   FAL_KEY="$(security find-generic-password -s studio-fal-key -w)" node picture.mjs ...
import fs from "node:fs";
import path from "node:path";
import { args, die, findStudio, brand } from "./lib.mjs";

const o = args();
const prompt = String(o.prompt ?? "").trim() || die("Usage: FAL_KEY=... node picture.mjs --prompt \"one object or place\" --out cover.jpg");
const out = path.resolve(o.out ?? "cover.jpg");
const key = process.env.FAL_KEY;
if (!key) die("No FAL_KEY in this command's environment, so no picture. The cover sets the hook larger instead, which works fine.");
if (/\b(person|people|man|woman|men|women|face|faces|hand|hands|child|kid|crowd|portrait|selfie|logo|text|words?)\b/i.test(prompt)) die("Pictures are objects and places only: no people, faces, hands, words or logos. Describe a thing or a place from the topic.");
const studio = findStudio(path.dirname(out), o.studio);
const b = brand(studio);
const model = String(o.model ?? b.settings.pictures?.model ?? "fal-ai/flux-pro/v1.1");
const STYLE = `Editorial photograph, natural light, real materials and textures, calm colours with deep tones close to ${b.c.board} and one small warm accent close to ${b.c.accent}, shallow depth of field, uncluttered, plain enough to read at thumbnail size. No people, no faces, no hands, no text, no letters, no numbers, no logos, no screens showing words.`;
const r = await fetch(`https://fal.run/${model}`, {
  method: "POST",
  headers: { authorization: `Key ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ prompt: `${prompt}. ${STYLE}`, image_size: "landscape_4_3", num_images: 1, output_format: "jpeg", enable_safety_checker: true }),
});
if (!r.ok) die(`fal said ${r.status}: ${(await r.text()).replace(/Key\s+\S+/g, "Key [hidden]").slice(0, 200)}`);
const url = (await r.json()).images?.[0]?.url;
if (!url) die("fal returned no picture.");
const img = await fetch(url);
if (!img.ok) die(`The picture didn't download (${img.status}).`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
console.log(`picture: ${out} (${model})`);
