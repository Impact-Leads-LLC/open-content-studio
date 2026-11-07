#!/bin/bash
# YouTube thumbnails for a produced full episode on a cloud machine (thumb engine, thumbnail-builder 3.1), made with the
# thumbnail-builder skill (skill/) and hook-maker (hook-maker/), in the studio's palette, from the owner's own photos.
# Three looks in rotation (the call, the number wall, the board); the owner makes two calls: which words, then which
# thumbnail. Two modes:
#   MODE=words   Claude finds the episode's biggest takeaway and writes three options, each with the words for the
#                looks it suits (words.mjs)
#   MODE=render  one option, every look it has words for: the guest frame for the call, the owner's photos made ready
#                (cutout given, from its mask, or made here with rembg), copy-fit (a line too wide goes back to Claude
#                for fewer letters, two rounds), render, gates G1-G13, review and feed sheets, deliver (render.py)
# The app's job script unpacks this folder to /tmp/job/thumb-engine and runs this file; work happens in /tmp/job/work.
# env: MODE OUT_LOG ANTHROPIC_API_KEY BRAIN_MCP_URL BRAIN_MCP_TOKEN [CLAUDE_MODEL, default claude-opus-5-5]
#      words: OUT_WORDS
#      render: OUT_THUMB_<LOOK> OUT_REVIEW_<LOOK> OUT_FEED_<LOOK> OUT_GATE_<LOOK> (LOOK = CALL, WALL, BOARD),
#              OUT_GUEST (the guest frame candidates), OUT_RESULT
# /tmp/job/context.json: studio, episode, title, transcript, playable; render: option, pairs per look (signed links),
# skip, order, guest, guest_video (signed link to the guest's camera), refs (may be {}), run_key, takeaway.
# JOB_DIR moves /tmp/job (local tests).
set -uo pipefail
E=$(cd "$(dirname "$0")" && pwd)
J=${JOB_DIR:-/tmp/job}
S=$J/status.txt; : > "$S"; T0=$(date +%s); L=$T0
say() { local n; n=$(date +%s); echo "$1 ($((n - L)) s)" >> "$S"; L=$n; }
put() { [ -n "${3:-}" ] && [ -s "$1" ] && curl -sS --retry 3 -X PUT -H "content-type: $2" -H "x-upsert: true" -H "Expect:" -T "$1" "$3" > /dev/null; }
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; put "$S" text/plain "${OUT_LOG:-}" || true; }
# anything shaped like a key or a signed link's secret is blanked out before it reaches the log
clean() {
  local tok="${BRAIN_MCP_TOKEN:-}"
  sed -E 's/sk-ant-[A-Za-z0-9_-]+/[key]/g; s/(token|sig|signature)=[^&" ]+/\1=[...]/g; s/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[key]/g' |
    if [ ${#tok} -ge 6 ]; then awk -v t="$tok" '{ while ((i = index($0, t)) > 0) $0 = substr($0, 1, i - 1) "[token]" substr($0, i + length(t)); print }'; else cat; fi
}
fail() { tail -4 "$2" 2>/dev/null | clean | sed 's/^/  /' >> "$S"; finish "FAILED at $1"; exit 1; }
W=$J/work
mkdir -p "$W" && cd "$J" || { finish "FAILED at setup (folders)"; exit 1; }
export JOB_DIR=$J

echo "machine: $(nproc 2>/dev/null || sysctl -n hw.ncpu) vCPU, thumbnail-builder $(cat "$E/skill/VERSION" 2>/dev/null)" >> "$S"
[ -d "$E/node_modules/@anthropic-ai/sdk" ] || (cd "$E" && npm init -y > /dev/null 2>&1; npm i --silent --no-audit --no-fund @anthropic-ai/sdk > "$W/npm.log" 2>&1) || fail "setup (sdk)" "$W/npm.log"

if [ "${MODE:-}" = "render" ]; then
  if command -v apt-get > /dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg python3-pip > /dev/null 2>&1 || { finish "FAILED at setup (apt)"; exit 1; }
  fi
  # the looks render with Pillow 11+ (no Chrome); the faces (the owner's photo and the call's guest frame) need OpenCV
  # (the YuNet model ships in skill/)
  python3 -c "from PIL import ImageMath; ImageMath.lambda_eval" 2> /dev/null || pip install -q --break-system-packages "Pillow>=11" > "$W/pip.log" 2>&1 || fail "setup (Pillow)" "$W/pip.log"
  python3 -c "import cv2, numpy" 2> /dev/null || pip install -q --break-system-packages opencv-python-headless numpy >> "$W/pip.log" 2>&1 || echo "faces: OpenCV didn't install, so photos need a face_box and the call can't find the guest's face" >> "$S"
  # the cutout tool, only when a photo arrives with neither a cutout nor a mask (rembg on the CPU; its model downloads
  # on first use). If it doesn't install, those photos play the board only, with the plain photo as its print.
  if python3 -c "import json,sys; c=json.load(open('$J/context.json')); p=[x for x in (c.get('pairs') or {}).values() if x]; sys.exit(0 if any(not (x.get('urls') or {}).get('person') and not (x.get('urls') or {}).get('mask') for x in p) else 1)" 2> /dev/null; then
    python3 -c "import rembg" 2> /dev/null || pip install -q --break-system-packages "rembg[cpu]>=2.0.50,<3" >> "$W/pip.log" 2>&1 \
      || echo "cutout: the cutout tool didn't install, so photos without a cutout play the board only" >> "$S"
  fi
  python3 "$E/skill/scripts/thumb.py" doctor > "$W/doctor.log" 2>&1 || fail "setup (thumb.py doctor)" "$W/doctor.log"
fi
say "machine ready"

case "${MODE:-}" in
  words)
    node "$E/words.mjs" options >> "$S" 2> "$W/words.err" || { finish "FAILED writing the words: $(tail -1 "$W/words.err" | clean | cut -c1-300)"; exit 1; }
    put "$W/words.json" application/json "${OUT_WORDS:-}" || { finish "FAILED saving the words"; exit 1; }
    say "words saved"
    finish "DONE"
    ;;
  render)
    python3 "$E/render.py" >> "$S" 2> "$W/render.err"; RC=$?
    # whatever came out goes up, so the app can show the checks even when nothing passed
    O=$W/out
    for look in call wall board; do
      U=$(echo "$look" | tr a-z A-Z)
      v="OUT_THUMB_$U"; put "$O/thumb-$look.jpg" image/jpeg "${!v:-}"
      v="OUT_REVIEW_$U"; put "$O/review-$look.jpg" image/jpeg "${!v:-}"
      v="OUT_FEED_$U"; put "$O/feed-$look.jpg" image/jpeg "${!v:-}"
      v="OUT_GATE_$U"; put "$O/gate-$look.json" application/json "${!v:-}"
    done
    put "$O/guest-candidates.jpg" image/jpeg "${OUT_GUEST:-}"
    put "$W/result.json" application/json "${OUT_RESULT:-}"
    if [ "$RC" != "0" ]; then
      [ -s "$W/fail.txt" ] || tail -4 "$W/render.err" 2> /dev/null | clean | sed 's/^/  /' >> "$S"
      finish "FAILED: $(cat "$W/fail.txt" 2> /dev/null | clean || echo "the thumbnails didn't come out")"; exit 1
    fi
    say "saved"
    finish "DONE"
    ;;
  *) finish "FAILED: MODE must be words or render"; exit 1 ;;
esac
