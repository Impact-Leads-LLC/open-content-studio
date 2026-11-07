#!/bin/bash
# The produced full episode on a cloud machine (episode engine). Every episode gets, without asking: the camera
# following whoever talks with slow pushes on long shots, a cold open, a title card, name cards, chapter cards, a
# graphic every two or three minutes, punch-ins, word-by-word captions, an end card, levelled sound.
# The app's job script unpacks this folder to /tmp/job/episode-engine and runs this file; work happens in /tmp/job.
# env: TOP_V TOP_A BOT_V BOT_A (the guest's and the host's camera and own audio file, signed links; TOP_A/BOT_A may be
#      empty) TOP_NAME BOT_NAME START END (seconds on the recording's clock, empty = the whole talk) WORDS_URL (saved word
#      times, optional) AD_URL (a pre-recorded ad read for the show, optional) BROLL (JSON [{url, offset, label}] of
#      screen shares, optional) ANTHROPIC_API_KEY BRAIN_MCP_URL BRAIN_MCP_TOKEN [CLAUDE_MODEL, default claude-opus-5-5]
#      OUT OUT_LOG OUT_SHOTS OUT_PLAN OUT_SRT OUT_CHAPTERS OUT_SHEET (signed upload links)
# /tmp/job/context.json: episode {title, guest, show}, guest_site, notes, rules, studio {owner, ownerFull, coach, brand,
#      handle, show, audience, website, bookingUrl, timezone, palette, fonts}
set -uo pipefail
S=/tmp/job/status.txt; : > "$S"; T0=$(date +%s); L=$T0
say() { local n; n=$(date +%s); echo "$1 ($((n - L)) s)" >> "$S"; L=$n; }
put() { [ -n "${3:-}" ] && [ -s "$1" ] && curl -sS --retry 3 -X PUT -H "content-type: $2" -H "x-upsert: true" -H "Expect:" -T "$1" "$3" > /dev/null; }
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; put "$S" text/plain "$OUT_LOG" || true; }
clean() { sed -E 's/sk-ant-[A-Za-z0-9_-]+/[key]/g; s/(token|sig|signature)=[^& ]+/\1=[...]/g; s/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]+/[jwt]/g'; }
fail() { tail -4 "$2" 2>/dev/null | clean | sed 's/^/  /' >> "$S"; finish "FAILED at $1"; exit 1; }
E=/tmp/job/episode-engine
export HF="npx --yes hyperframes@0.8.143"
cd /tmp/job && mkdir -p work

echo "machine: $(nproc) vCPU" >> "$S"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg fontconfig python3-pip libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 fonts-liberation libasound2t64 > /dev/null 2>&1 || { finish "FAILED at setup (apt)"; exit 1; }
sudo mount -o remount,size=2G /dev/shm 2> /dev/null
(cd "$E" && npm init -y > /dev/null 2>&1; npm i --silent --no-audit --no-fund @anthropic-ai/sdk > /tmp/job/npm.log 2>&1) || fail "setup (sdk)" /tmp/job/npm.log
$HF browser ensure > work/browser.log 2>&1 || fail "setup (browser)" work/browser.log
# face finding (OpenCV's YuNet); without it every card falls back to keeping clear of the middle of the frame
pip install -q --break-system-packages opencv-python-headless numpy pillow > work/pip.log 2>&1 || echo "faces: OpenCV didn't install, using the middle of the frame" >> "$S"
say "machine ready"

python3 "$E/edit.py" analyze >> "$S" 2> work/analyze.log || { NOS=$(grep -E '^No sound' "$S" | tail -1); [ -n "$NOS" ] && { finish "FAILED: $NOS"; exit 1; }; fail "reading the voices" work/analyze.log; }
put work/shots.json application/json "${OUT_SHOTS:-}" || true
python3 "$E/faces.py" >> "$S" 2> work/faces.log || echo "faces: not found, keeping clear of the middle of the frame" >> "$S"
# the show's ad read, if it has one
[ -n "${AD_URL:-}" ] && { curl -sSfL "$AD_URL" -o work/ad.mp4 || rm -f work/ad.mp4; }
# screen shares recorded during the call (BROLL: [{url, offset, label}], offset = seconds into the recording)
[ -n "${BROLL:-}" ] && python3 - <<'PY' >> "$S" 2>> work/broll.log
import json, os, subprocess
out = []
for k, b in enumerate(json.loads(os.environ["BROLL"])):
    f = f"work/broll-{k}.mp4"
    if subprocess.run(["curl", "-sSfL", b["url"], "-o", f]).returncode:
        continue
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip()
    if d:
        out.append({"file": f, "offset": float(b["offset"]), "len": float(d), "label": b.get("label") or "Screen share"})
json.dump(out, open("work/broll.json", "w"))
print(f"screen shares: {len(out)}")
PY
say "voices, faces and sound"

# the camera edit renders while the words come in and Claude plans
(python3 "$E/edit.py" base > work/base.log 2>&1; echo $? > work/base.rc) &
BASE=$!

if [ -n "${WORDS_URL:-}" ] && curl -sSfL "$WORDS_URL" -o work/words.json; then :; else
  rm -f work/words.json
  $HF models install parakeet > work/parakeet.log 2>&1 || fail "setup (speech model)" work/parakeet.log
fi
python3 "$E/words.py" >> "$S" 2> work/words.log || fail "words" work/words.log
say "words"
node "$E/plan.mjs" > work/plan.log 2> work/plan.err || { echo "plan: failed, going on with a plain one" >> "$S"; tail -2 work/plan.err | clean >> "$S"; }
[ -s work/plan.json ] || fail "plan" work/plan.err
clean < work/plan.log >> "$S"
put work/plan.json application/json "${OUT_PLAN:-}" || true
say "plan"

wait $BASE
[ "$(cat work/base.rc 2>/dev/null)" = "0" ] || fail "camera edit" work/base.log
cat work/base.log >> "$S"
say "camera edit"

python3 "$E/build.py" >> "$S" 2> work/build.log || { echo "animated moments: build failed, going on without them" >> "$S"; tail -2 work/build.log | clean >> "$S"; echo "[]" > work/segments.json; }
if [ "$(python3 -c 'import json;print(len(json.load(open("work/segments.json"))))')" != "0" ]; then
  (cd work/comp && $HF render -o ../segments.mp4 > ../render.log 2>&1) && [ -s work/segments.mp4 ] || {
    echo "animated moments: render failed, going on without them" >> "$S"; tail -3 work/render.log | sed 's/\x1b\[[0-9;]*m//g' | clean >> "$S"; echo "[]" > work/segments.json; rm -f work/segments.mp4; }
fi
say "animated moments"

python3 "$E/captions.py" >> "$S" 2> work/captions.log || fail captions work/captions.log
python3 "$E/final.py" >> "$S" 2> work/final.log || fail "final pass" work/final.log
say "final pass"

echo "saving the episode" >> "$S"
put work/episode.mp4 video/mp4 "$OUT" || { finish "FAILED saving the episode"; exit 1; }
put work/captions.srt text/plain "${OUT_SRT:-}" || true
put work/chapters.txt text/plain "${OUT_CHAPTERS:-}" || true
put work/sheet.jpg image/jpeg "${OUT_SHEET:-}" || true
say "saved"
finish "DONE"
