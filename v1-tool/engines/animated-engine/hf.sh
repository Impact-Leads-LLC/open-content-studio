#!/bin/bash
# Run the HyperFrames CLI the way the installed Claude Code plugin does.
# Order: $HF_CLI if set, the newest installed hyperframes plugin's launcher, then npx.
set -e
if [ -n "$HF_CLI" ]; then exec $HF_CLI "$@"; fi
L=$(ls -dt "$HOME"/.claude/plugins/cache/hyperframes/hyperframes/*/skills/hyperframes/scripts/plugin-cli.mjs 2>/dev/null | head -1)
if [ -n "$L" ]; then exec node "$L" "$@"; fi
exec npx --yes hyperframes "$@"
