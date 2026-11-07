#!/bin/bash
# The reel editor: one clip in, one edited 9:16 reel out, in the studio's reel look.
# setup, download, transcribe, edit plan (Claude, with the coach's first look), cut, natural grade, build, check,
# render, cover flash, upload. The app's job script unpacks this folder to /tmp/job/stack-engine and runs this file.
# env: CLIP_URL OUT_MP4 OUT_SHEET OUT_PLAN OUT_LOG [OUT_COVER] ANTHROPIC_API_KEY BRAIN_MCP_URL BRAIN_MCP_TOKEN
#   [CLAUDE_MODEL, default claude-opus-5-5]. OUT_* are signed upload links.
# /tmp/job/context.json: layout ("stack" or "single"), episode {title, guest, show}, piece {num, title, hook, caption},
#   top, bottom, show, duration, turns, script, notes, rules, coach (false skips the coach's first look), start,
#   for a revision previous + change, and studio {owner, ownerFull, coach, brand, handle, show, audience, website,
#   bookingUrl, timezone, palette, fonts} (names on screen and in the prompts, and the colours).
# The HyperFrames CLI is pinned below (HF_CLI); reel/fx.py and reel/package.json name the same version.
set -uo pipefail
S=/tmp/job/status.txt; mkdir -p /tmp/job; : > "$S"
T0=$(date +%s); L=$T0
say() { local n; n=$(date +%s); echo "$1: $((n - L)) s" >> "$S"; L=$n; }
put() { curl -sS -X PUT -H "content-type: $2" -H "x-upsert: true" --data-binary @"$1" "$3" > /dev/null; }
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; put "$S" text/plain "$OUT_LOG" || true; }
# the last lines of the failing step's log, with anything shaped like a key blanked out
fail() { tail -4 "$2" 2>/dev/null | sed -E 's/sk-ant-[A-Za-z0-9_-]+/[key]/g; s/(Bearer) [A-Za-z0-9._-]+/\1 [...]/g; s/(token|sig|signature|apikey|key)=[^& ]+/\1=[...]/g; s/^/  /' >> "$S"; finish "FAILED at $1"; exit 1; }
echo "machine: $(nproc) vCPU, $(free -g | awk '/Mem:/{print $2}') GB RAM" >> "$S"
export HF_CLI="npx --yes hyperframes@0.8.143"

sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg python3-pil libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 fonts-liberation libasound2t64 > /dev/null 2>&1 || { finish "FAILED at setup (apt)"; exit 1; }
sudo mount -o remount,size=2G /dev/shm
# Pillow draws the reel's cover (scripts/cover_flash.py)
python3 -c "import PIL" 2>/dev/null || pip3 install -q --break-system-packages pillow > /tmp/job/pip.log 2>&1 || python3 -m pip install -q --break-system-packages pillow >> /tmp/job/pip.log 2>&1 || true
$HF_CLI browser ensure > /tmp/job/browser.log 2>&1 || fail "setup (chrome)" /tmp/job/browser.log
# speech to text: the cloud machine has no compiler for whisper.cpp, so HyperFrames' Parakeet model (sherpa-onnx, ~640 MB)
$HF_CLI models install parakeet > /tmp/job/parakeet.log 2>&1 || fail "setup (speech model)" /tmp/job/parakeet.log
say "setup"

E=/tmp/job/stack-engine
(cd "$E" && npm init -y > /dev/null 2>&1; npm i --silent --no-audit --no-fund @anthropic-ai/sdk > /tmp/job/npm.log 2>&1) || fail "setup (sdk)" /tmp/job/npm.log
cd "$E/reel" && cp /tmp/job/context.json . && mkdir -p work renders
curl -sSfL "$CLIP_URL" -o work/input.mp4 || { finish "FAILED at download (clip)"; exit 1; }
ffmpeg -v error -y -i work/input.mp4 -map 0:v:0 -map 0:a:0 \
  -vf "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p" \
  -c:v libx264 -preset medium -crf 15 -g 30 -c:a aac -b:a 192k -movflags +faststart assets/source.mp4 2> work/transcode.log || fail transcode work/transcode.log
say "download"

python3 "$E/scripts/transcribe_chunks.py" > work/transcribe.log 2>&1 || fail transcribe work/transcribe.log
say "transcribe ($(python3 -c "import json;print(len(json.load(open('work/words_chunked.json'))['words']))") words)"
node "$E/scripts/plan.mjs" > work/plan.log 2>&1 || fail "edit plan" work/plan.log
cat work/plan.log >> "$S"
say "edit plan"
python3 "$E/scripts/cut.py" > work/cut.log 2>&1 || fail cut work/cut.log
say "cut"
NAT="eq=contrast=1.05:saturation=0.88:gamma=0.97,colorbalance=rs=0.01:bs=0.025:bm=0.01,vignette=angle=0.6"
ffmpeg -v error -y -i work/cut-raw.mp4 -vf "$NAT,noise=alls=3:allf=t,format=yuv420p" -map 0:v -map 0:a -c:v libx264 -crf 17 -preset medium -g 30 -movflags +faststart -c:a copy assets/moody.mp4 2> work/grade.log || fail grade work/grade.log
ffmpeg -v error -y -sseof -0.05 -i assets/moody.mp4 -frames:v 1 -vf "gblur=sigma=26,eq=brightness=-0.04" -q:v 3 assets/endframe.jpg
say "grade"
python3 build_auto.py > work/build.log 2>&1 || fail build work/build.log
cat work/build.log >> "$S"
# the plan plus what's said in the reel by speaker, for the editor's note and the coach's review
put plan_out.json application/json "$OUT_PLAN" || put plan.json application/json "$OUT_PLAN" || true
$HF_CLI check > work/check.log 2>&1; grep -E "error\(s\)" work/check.log | sed 's/\x1b\[[0-9;]*m//g' | tail -1 >> "$S"
say "build"
$HF_CLI render --quality draft -o renders/reel.mp4 > work/render.log 2>&1 || fail render work/render.log
[ -s renders/reel.mp4 ] || fail "render (no file)" work/render.log
say "render"
# the reel opens on its cover for half a second, then slides into the content; the cover is also the image every
# network shows
SHIFT=0
if python3 "$E/scripts/cover_flash.py" > work/cover.log 2>&1 && [ -s renders/reel-cover.mp4 ]; then
  mv renders/reel-cover.mp4 renders/reel.mp4; SHIFT=14; cat work/cover.log >> "$S"
else
  echo "cover: skipped ($(tail -1 work/cover.log | cut -c1-160))" >> "$S"; rm -f cover.jpg
fi
put renders/reel.mp4 video/mp4 "$OUT_MP4" || { finish "FAILED at upload"; exit 1; }
if [ -n "${OUT_COVER:-}" ]; then
  [ -s cover.jpg ] || ffmpeg -v error -y -ss 0.5 -i renders/reel.mp4 -frames:v 1 -q:v 2 cover.jpg
  [ -s cover.jpg ] && put cover.jpg image/jpeg "$OUT_COVER" || true
fi
# a contact sheet so the coach can check who is on screen under each graphic: 14 frames about 4 seconds apart, picked
# by build_auto.py where no box is mid-build (falls back to one frame every 4 seconds); shifted past the cover
SEL=$(tr ' ' '\n' < work/sheet_times.txt 2>/dev/null | grep -E '^[0-9]+$' | awk -v s=$SHIFT '{print $1 + s}' | sed 's/.*/eq(n\\,&)/' | paste -sd+ -)
if [ -n "$SEL" ]; then VF="select='$SEL',scale=270:-2,tile=7x2"; else VF="fps=1/4,scale=270:-2,tile=7x2"; fi
ffmpeg -v error -y -i renders/reel.mp4 -vf "$VF" -frames:v 1 -q:v 4 sheet.jpg && put sheet.jpg image/jpeg "$OUT_SHEET" || true
echo "reel: $(ffprobe -v error -show_entries format=duration -of csv=p=0 renders/reel.mp4 | cut -c1-5) s" >> "$S"
say "upload"
finish "DONE"
