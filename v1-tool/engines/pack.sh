#!/bin/bash
# Pack the engines for the app: one .tgz per engine in engines/dist/, each with its folder name on top
# (stack-engine/, carousel-engine/, episode-engine/, animated-engine/, thumb-engine/), because the app's job script
# unpacks it into /tmp/job/ and runs <name>/run.sh.
#
#   bash engines/pack.sh                 packs all five
#   bash engines/pack.sh thumb-engine    packs one (or several: bash engines/pack.sh stack-engine carousel-engine)
#
# Works from any folder. Leaves out what a local test run leaves behind (work/, renders/, node_modules/, caches, the
# test page and plan). Then upload: node engines/upload.mjs (all packed files) or node engines/upload.mjs thumb-engine.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ALL=(stack-engine carousel-engine episode-engine animated-engine thumb-engine)
if [ "$#" -gt 0 ]; then NAMES=("$@"); else NAMES=("${ALL[@]}"); fi
OUT="$HERE/dist"
mkdir -p "$OUT"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

for n in "${NAMES[@]}"; do
  n=${n%/}; n=${n%.tgz}
  case " ${ALL[*]} " in *" $n "*) ;; *) echo "Unknown engine: $n (one of: ${ALL[*]})" >&2; exit 1 ;; esac
  [ -d "$HERE/$n" ] || { echo "Missing folder: $HERE/$n" >&2; exit 1; }
  cp -R "$HERE/$n" "$STAGE/$n"
  cd "$STAGE/$n"
  # anything a test run made: folders anywhere, files at the root, and the reel editor's working files
  find . \( -name __pycache__ -o -name node_modules -o -name work -o -name renders -o -name snapshots -o -name deck \) -type d -prune -exec rm -rf {} +
  find . \( -name .DS_Store -o -name '*.pyc' -o -name '.env' -o -name '.env.*' \) -type f -delete
  rm -f package.json package-lock.json context.json status.txt
  if [ "$n" = stack-engine ]; then
    rm -f reel/index.html reel/plan.json reel/plan_out.json reel/cutlist.json reel/context.json reel/cover.jpg reel/cover.png reel/sheet.jpg
    rm -f reel/assets/source.mp4 reel/assets/moody.mp4 reel/assets/endframe.jpg reel/assets/g[0-9]*-*
  fi
  if [ "$n" = episode-engine ] || [ "$n" = animated-engine ]; then
    rm -f index.html plan.json plan_out.json
  fi
  cd "$STAGE"
  rm -f "$OUT/$n.tgz"
  COPYFILE_DISABLE=1 tar -czf "$OUT/$n.tgz" "$n"
  rm -rf "$STAGE/$n"
  echo "packed dist/$n.tgz ($(du -h "$OUT/$n.tgz" | cut -f1))"
done
echo "upload: node $(basename "$HERE")/upload.mjs   (or by hand in Supabase Storage: bucket studio-media, as uploads/<unix-ms>-<name>.tgz)"
