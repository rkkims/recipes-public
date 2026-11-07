#!/usr/bin/env bash
# Republish the static site when a curation batch lands — STATIC-SPEC §6.
#
# Runs every 15 minutes from jipbap-static.timer and is deliberately inert
# until two things exist: the enable flag (deploy/.static-enabled) and the
# build-static pipeline (STATIC-SPEC §5, stage 2/3). Until then every run is
# a hash check and an exit — a quiet timer costs nothing.
#
# The stamp is a hash of everything the static site is derived from. New
# curation batch → hash moves → rebuild and deploy. No change, no work.
set -euo pipefail

REPO=/home/ubuntu/recipes
STATE_DIR="$HOME/.local/state"
STAMP="$STATE_DIR/jipbap-static.stamp"

# Not enabled: the switch (STATIC-SPEC §1) has not been thrown. Exit quietly.
[ -f "$REPO/deploy/.static-enabled" ] || exit 0

cd "$REPO"
HASH=$(cat \
  data/curation/recipes.json \
  data/ontology/ontology.json \
  data/ontology/recipe-index.json \
  app/src/lib/retailers.ts \
  app/src/lib/retailer-brand.ts \
  2>/dev/null | sha256sum | cut -d' ' -f1)

mkdir -p "$STATE_DIR"
[ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$HASH" ] && exit 0

# Pipeline present? build-static is stage 2/3; until it exists, say so once
# per change rather than failing the unit.
if ! npm run 2>/dev/null | grep -q "build-static"; then
  echo "inputs changed but build-static does not exist yet (STATIC-SPEC §5) — stamping and skipping"
  echo "$HASH" > "$STAMP"
  exit 0
fi

echo "curation inputs changed — rebuilding static site"
npm run build-static
echo "$HASH" > "$STAMP"
echo "static site republished"
