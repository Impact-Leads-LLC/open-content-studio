#!/bin/bash
# Secrets without anyone reading them: make random ones, hand them to Supabase and Vercel, never print a value.
# Values live in app/.env.local (never committed). Run from anywhere.
#
#   bash app/scripts/secrets.sh new NAME           a random value for NAME in app/.env.local (BRAIN_MCP_TOKEN, CRON_SECRET)
#   bash app/scripts/secrets.sh set NAME VALUE     a plain, non-secret value (BRAIN_MCP_URL), replacing any line already there
#   bash app/scripts/secrets.sh supabase REF       sets the brain function's STUDIO_BRAIN_TOKENS to BRAIN_MCP_TOKEN
#   bash app/scripts/secrets.sh vercel NAME...     copies those settings from app/.env.local to the linked Vercel project
#                                                  (production and preview), replacing what's there
#   bash app/scripts/secrets.sh check              which settings are filled in (node scripts/check-env.mjs)
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
ENV="$HERE/.env.local"
touch "$ENV"; chmod 600 "$ENV"
# a name with no line in the file is empty, not an error (set -e would end the script on grep's no-match)
get() { { grep -E "^$1=" "$ENV" || true; } | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
set_var() {
  local name=$1 value=$2 tmp
  tmp=$(mktemp)
  grep -vE "^$name=" "$ENV" > "$tmp" || true
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  mv "$tmp" "$ENV"; chmod 600 "$ENV"
}
case "${1:-}" in
  new)
    name=${2:?say which setting, e.g. BRAIN_MCP_TOKEN}
    if [ -n "$(get "$name")" ] && [ "${3:-}" != "--replace" ]; then echo "$name already has a value in app/.env.local (add --replace to make a new one)."; exit 0; fi
    set_var "$name" "$(openssl rand -hex 32)"
    echo "Made a new $name in app/.env.local." ;;
  supabase)
    ref=${2:?say the Supabase project ref}
    token=$(get BRAIN_MCP_TOKEN)
    [ -n "$token" ] || { echo "No BRAIN_MCP_TOKEN in app/.env.local yet: bash app/scripts/secrets.sh new BRAIN_MCP_TOKEN"; exit 1; }
    extra=${STUDIO_BRAIN_EXTRA_TOKENS:-}
    out=$(cd "$HERE/.." && npx --yes supabase@2.119.0 secrets set --project-ref "$ref" "STUDIO_BRAIN_TOKENS=$token${extra:+,$extra}" 2>&1) || {
      echo "Couldn't set STUDIO_BRAIN_TOKENS on project $ref:"; printf '%s\n' "$out" | grep -v -i "token" | tail -5; exit 1; }
    echo "Set STUDIO_BRAIN_TOKENS on project $ref." ;;
  set)
    name=${2:?say which setting}; value=${3:?say the value}
    set_var "$name" "$value"
    echo "Set $name in app/.env.local." ;;
  vercel)
    shift; [ "$#" -gt 0 ] || { echo "Say which settings to copy."; exit 1; }
    for name in "$@"; do
      value=$(get "$name")
      [ -n "$value" ] || { echo "skipped $name: not in app/.env.local"; continue; }
      for target in production preview; do
        (cd "$HERE" && npx --yes vercel@65.12.1 env rm "$name" "$target" -y > /dev/null 2>&1 || true)
        (cd "$HERE" && printf '%s' "$value" | npx --yes vercel@65.12.1 env add "$name" "$target" > /dev/null 2>&1) || { echo "Couldn't copy $name to Vercel ($target). Is this folder linked (npx --yes vercel@65.12.1 link)?"; exit 1; }
      done
      echo "copied $name to Vercel (production, preview)"
    done
    echo "Redeploy for the new settings to load." ;;
  check)
    node "$HERE/scripts/check-env.mjs" ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
