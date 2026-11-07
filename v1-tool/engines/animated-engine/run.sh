#!/bin/bash
# The animated reel editor on a cloud machine (animated engine): one piece's words in, a finished 9:16 reel out, with no
# camera footage: the cover, then animated type and brand graphics on The Board with a splash of Kinetic Layers, then
# the end card. With the owner's voiceover (VO_URL) every beat follows the voice and its words run as live captions;
# without one the reel goes at reading pace with sound effects.
# setup, plan (Claude), build, check, render, cover, contact sheet, upload.
# The app's job script unpacks this folder to /tmp/job/animated-engine and runs this file; work happens in /tmp/job.
# env: OUT_MP4 OUT_LOG OUT_SHEET OUT_PLAN OUT_COVER (signed upload links) ANTHROPIC_API_KEY BRAIN_MCP_URL BRAIN_MCP_TOKEN
#      [CLAUDE_MODEL, default claude-opus-5-5] [VO_URL, a signed link to the voiceover take]
# /tmp/job/context.json: piece {num, title, hook, why, outline, insight, awareness, funnel, caption, angle, cta, service,
#      editor_notes}, episode {title, show, kind}, script [{at, who, text, in}], stage, notes, rules, [previous {beats,
#      end}, change], [vo {lines, seconds}], studio {owner, ownerFull, coach, brand, handle, show, audience, website,
#      bookingUrl, timezone, palette, fonts}
set -uo pipefail
S=/tmp/job/status.txt; mkdir -p /tmp/job; : > "$S"
T0=$(date +%s); L=$T0
say() { local n; n=$(date +%s); echo "$1 ($((n - L)) s)" >> "$S"; L=$n; }
put() { [ -n "${3:-}" ] && [ -s "$1" ] && curl -sS --retry 3 -X PUT -H "content-type: $2" -H "x-upsert: true" -H "Expect:" -T "$1" "$3" > /dev/null; }
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; put "$S" text/plain "${OUT_LOG:-}" || true; }
# anything shaped like a key, a token or a signed link's signature is blanked before it reaches the status file
clean() { sed -E 's/sk-ant-[A-Za-z0-9_-]+/[key]/g; s/(token|sig|signature)=[^& ]+/\1=[...]/g; s/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]+/[jwt]/g'; }
fail() { tail -4 "$2" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | clean | sed 's/^/  /' >> "$S"; finish "FAILED at $1"; exit 1; }
E=/tmp/job/animated-engine
export HF="npx --yes hyperframes@0.8.143"
export HF_CLI="$HF"
cd /tmp/job && mkdir -p work

echo "machine: $(nproc) vCPU, $(free -g 2>/dev/null | awk '/Mem:/{print $2}') GB RAM" >> "$S"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg python3-pip libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 fonts-liberation libasound2t64 > /dev/null 2>&1 || { finish "FAILED at setup (apt)"; exit 1; }
sudo mount -o remount,size=2G /dev/shm 2> /dev/null
# Pillow measures the type so every line fits the phone screen (without it the builder estimates)
python3 -c "import PIL" 2>/dev/null || pip3 install -q --break-system-packages pillow > work/pip.log 2>&1 || python3 -m pip install -q --break-system-packages pillow >> work/pip.log 2>&1 || echo "type: Pillow didn't install, sizes are estimates" >> "$S"
(cd "$E" && npm init -y > /dev/null 2>&1; npm i --silent --no-audit --no-fund @anthropic-ai/sdk > /tmp/job/npm.log 2>&1) || fail "setup (sdk)" /tmp/job/npm.log
$HF browser ensure > work/browser.log 2>&1 || fail "setup (browser)" work/browser.log
say "machine ready"

# the voiceover: cleaned (low rumble off, long pauses shortened, levelled to -14 LUFS), then every word timed
if [ -n "${VO_URL:-}" ]; then
  curl -sSfL "$VO_URL" -o work/vo-raw || fail "download (voiceover)" /dev/null
  ffmpeg -v error -y -i work/vo-raw -vn -ac 1 -ar 48000 -af "highpass=f=80,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:start_silence=0.12:stop_periods=-1:stop_duration=0.7:stop_threshold=-45dB:stop_silence=0.32,acompressor=threshold=-20dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=7" work/vo.wav 2> work/vo.log || fail "voiceover (clean)" work/vo.log
  ffmpeg -v error -y -i work/vo.wav -c:a aac -b:a 192k work/vo.m4a 2>> work/vo.log || fail "voiceover (encode)" work/vo.log
  $HF models install parakeet > work/parakeet.log 2>&1 || fail "setup (speech model)" work/parakeet.log
  python3 "$E/transcribe_chunks.py" work/vo.wav > work/transcribe.log 2>&1 || fail "voiceover (words)" work/transcribe.log
  python3 -c "import json; w=json.load(open('work/words_chunked.json'))['words']; json.dump({'words': w}, open('work/vo-words.json', 'w'))" || fail "voiceover (words)" work/transcribe.log
  echo "voiceover: $(ffprobe -v error -show_entries format=duration -of csv=p=0 work/vo.m4a | cut -c1-5) s, $(python3 -c "import json;print(len(json.load(open('work/vo-words.json'))['words']))") words" >> "$S"
  say "voiceover"
fi

# the plan: Claude turns the piece's words into beats (a plain plan from the piece's own words if Claude isn't there)
NODE_PATH="$E/node_modules" node "$E/plan.mjs" > work/plan.log 2> work/plan.err || fail "plan" work/plan.err
[ -s work/plan.json ] || fail "plan (no file)" work/plan.err
clean < work/plan.log >> "$S"
say "plan"

python3 "$E/build.py" > work/build.log 2>&1 || fail build work/build.log
cat work/build.log >> "$S"
# the plan with every beat's time and what's on screen, for the editor's note and the coach's review
put work/plan_out.json application/json "${OUT_PLAN:-}" || put work/plan.json application/json "${OUT_PLAN:-}" || true
(cd work/comp && $HF check > ../check.log 2>&1); grep -E "error\(s\)" work/check.log | sed 's/\x1b\[[0-9;]*m//g' | head -1 | sed 's/^ */check: /' >> "$S"
say "build"

(cd work/comp && $HF render -o ../reel.mp4 > ../render.log 2>&1) || fail render work/render.log
[ -s work/reel.mp4 ] || fail "render (no file)" work/render.log
# with a voice, the finished mix is levelled to -14 LUFS (the take plus the sound effects under it)
if [ -s work/vo.m4a ]; then
  ffmpeg -v error -y -i work/reel.mp4 -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:a aac -b:a 192k -movflags +faststart work/reel-mix.mp4 2> work/mix.log && mv work/reel-mix.mp4 work/reel.mp4 || echo "mix: left as rendered" >> "$S"
fi
say "render"

# the cover every network shows: the reel's own first frame, where the cover holds for half a second
ffmpeg -v error -y -ss 0.2 -i work/reel.mp4 -frames:v 1 -q:v 2 work/cover.jpg 2> work/cover.log || echo "cover: no still ($(tail -1 work/cover.log | clean | cut -c1-120))" >> "$S"
# a contact sheet for the coach's review: the cover and each beat once it has settled (build.py picks the frames)
SEL=$(tr ' ' '\n' < work/sheet_times.txt 2>/dev/null | grep -E '^[0-9]+$' | sed 's/.*/eq(n\\,&)/' | paste -sd+ -)
N=$(tr ' ' '\n' < work/sheet_times.txt 2>/dev/null | grep -cE '^[0-9]+$' || true)
if [ -n "$SEL" ]; then VF="select='$SEL',scale=270:-2,tile=$(( (N + 1) / 2 ))x2"; else VF="fps=1/4,scale=270:-2,tile=7x2"; fi
ffmpeg -v error -y -i work/reel.mp4 -vf "$VF" -frames:v 1 -q:v 4 work/sheet.jpg 2> work/sheet.log || echo "sheet: not made" >> "$S"

put work/reel.mp4 video/mp4 "${OUT_MP4:-}" || { finish "FAILED at upload"; exit 1; }
put work/cover.jpg image/jpeg "${OUT_COVER:-}" || true
put work/sheet.jpg image/jpeg "${OUT_SHEET:-}" || true
echo "reel: $(ffprobe -v error -show_entries format=duration -of csv=p=0 work/reel.mp4 | cut -c1-5) s" >> "$S"
say "upload"
finish "DONE"
