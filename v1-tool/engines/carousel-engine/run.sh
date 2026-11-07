#!/bin/bash
# The carousel builder: one carousel idea in, up to 10 slides out (1080x1350 PNGs plus a contact sheet), built with the
# carousel skill in kit/ under the studio's brain doc "Carousels". scripts/build.mjs plans the deck (the story format by
# default: a graphic cover, plain reading slides, the outro), pulls stills from the camera feeds, writes the slides,
# renders them with Chrome and checks them. 10 at most: schedulers take 10 images a post.
# The app's job script unpacks this folder to /tmp/job/carousel-engine and runs this file.
# env: OUT_SLIDE_1..OUT_SLIDE_10 OUT_SHEET OUT_PLAN OUT_LOG ANTHROPIC_API_KEY BRAIN_MCP_URL BRAIN_MCP_TOKEN
#   [CLAUDE_MODEL, default claude-opus-5-5] [TOP_URL BOTTOM_URL: the guest's and the host's camera feeds, for stills]
#   [FAL_KEY FAL_IMAGE_MODEL: a generated cover picture when there's no episode still]
# /tmp/job/context.json: episode {title, guest, show}, piece {num, title, hook, why, outline, caption, awareness, insight,
#   brain}, notes, script, top, bottom, and studio {owner, ownerFull, coach, brand, handle, show, audience, website,
#   bookingUrl, timezone, palette, fonts}
set -uo pipefail
S=/tmp/job/status.txt; mkdir -p /tmp/job; : > "$S"
T0=$(date +%s); L=$T0
say() { local n; n=$(date +%s); echo "$1: $((n - L)) s" >> "$S"; L=$n; }
put() { curl -sS -X PUT -H "content-type: $2" -H "x-upsert: true" --data-binary @"$1" "$3" > /dev/null; }
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; put "$S" text/plain "$OUT_LOG" || true; }
# the last lines of the failing step's log, with anything shaped like a key blanked out
fail() { tail -6 "$2" 2>/dev/null | sed -E 's/sk-ant-[A-Za-z0-9_-]+/[key]/g; s/(Bearer|Key) [A-Za-z0-9._:-]+/\1 [...]/g; s/(token|sig|signature|apikey|key)=[^& ]+/\1=[...]/g; s/^/  /' >> "$S"; finish "FAILED at $1"; exit 1; }
echo "machine: $(nproc) vCPU, $(free -g | awk '/Mem:/{print $2}') GB RAM" >> "$S"

sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg python3-pil libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 fonts-liberation libasound2t64 > /dev/null 2>&1 || { finish "FAILED at setup (apt)"; exit 1; }
npx --yes hyperframes@0.8.143 browser ensure > /tmp/job/browser.log 2>&1 || fail "setup (chrome)" /tmp/job/browser.log
# render.py looks for HyperFrames' headless shell itself; point it at whatever was installed to be sure
CHROME_PATH=$(find "$HOME/.cache" -type f -name 'chrome-headless-shell' 2>/dev/null | head -1); export CHROME_PATH
[ -n "$CHROME_PATH" ] || fail "setup (chrome not found)" /tmp/job/browser.log
E=/tmp/job/carousel-engine
(cd "$E" && npm init -y > /dev/null 2>&1; npm i --silent --no-audit --no-fund @anthropic-ai/sdk > /tmp/job/npm.log 2>&1) || fail "setup (sdk)" /tmp/job/npm.log
say "setup"

cd "$E" && mkdir -p work deck/slides deck/assets deck/png
node scripts/build.mjs > work/build.log 2>&1 || fail "build" work/build.log
L=$(date +%s)  # build.mjs logged its own steps; time the upload on its own

i=1
for f in $(ls deck/png/*.png | grep -v contact-sheet | sort); do
  [ "$i" -le 10 ] || break
  var="OUT_SLIDE_$i"; put "$f" image/png "${!var}" || { finish "FAILED at upload"; exit 1; }
  i=$((i + 1))
done
[ -f deck/png/contact-sheet.png ] && put deck/png/contact-sheet.png image/png "$OUT_SHEET" || true
put deck/deck.json application/json "$OUT_PLAN" || { finish "FAILED at upload (deck)"; exit 1; }
say "upload ($((i - 1)) slides)"
finish "DONE"
