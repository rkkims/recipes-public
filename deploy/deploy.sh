#!/usr/bin/env bash
#
# Build and put it live.
#
#   ./deploy/deploy.sh
#
# ── Why it stages and swaps ────────────────────────────────────────────────
#
# It used to build straight into `.next-prod`, which is the directory the live
# service loads from. A build that failed halfway therefore destroyed the live
# build — and did it invisibly, because the running process had already loaded
# what it needed and went on serving. Everything looked fine until the next
# restart, which failed with "Could not find a production build" and left the
# site down. That is the worst shape a failure can have: the damage and the
# symptom separated by hours.
#
# So the build goes to `.next-staging` and only becomes `.next-prod` once it has
# succeeded AND produced something that looks like a real build. The previous
# one is kept as `.next-prev` for exactly as long as it takes to find out
# whether the new one answers, and put back if it does not.
#
# The order is the argument: typecheck before build so a broken tree never
# becomes a broken build; build before swap so a broken build never becomes a
# broken deploy; swap before restart so the downtime is a process restart
# rather than a compile.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/app"

PROD="$APP/.next-prod"
STAGING="$APP/.next-staging"
PREV="$APP/.next-prev"

echo "── client bundle ──────────────────────────────────────────"
# The grid and the drawer read the ontology and the kept shelf from
# `app/public/static-data/` on the device (STATIC-SPEC §2). It is generated,
# gitignored, and therefore ABSENT on a fresh checkout — and stale the moment
# a curation batch lands. Regenerating here is what makes "curate and it shows
# up" true without anyone remembering a second command.
cd "$ROOT"
npm run static-data

echo "── typecheck ──────────────────────────────────────────────"
cd "$APP"
npx tsc --noEmit

echo "── build → .next-staging ──────────────────────────────────"
# Never `.next`: that is what a curation session on :5173 serves, and rewriting
# it mid-review kills the open page. And never `.next-prod` — see above.
rm -rf "$STAGING"
NEXT_DIST_DIR=.next-staging npx next build

# `next build` exiting 0 is necessary and not sufficient: the failure that
# started all this printed errors and left a directory behind. BUILD_ID is
# written last, so its presence is the closest thing to a completion marker.
if [ ! -f "$STAGING/BUILD_ID" ]; then
  echo "FAILED: build produced no BUILD_ID — nothing was swapped, site untouched" >&2
  exit 1
fi

echo "── backup owners.json ─────────────────────────────────────"
# The only file here that cannot be regenerated. Taken before the swap rather
# than after, so a deploy that goes wrong still has the state that was live a
# minute ago. The hourly systemd snapshot is the real backup; this is the one
# tied to this specific change.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$ROOT/data/backup"
if [ -f "$ROOT/data/app/owners.json" ]; then
  cp "$ROOT/data/app/owners.json" "$ROOT/data/backup/owners-$STAMP.json"
  find "$ROOT/data/backup" -name 'owners-*.json' -mtime +14 -delete
fi

echo "── swap ───────────────────────────────────────────────────"
rm -rf "$PREV"
[ -d "$PROD" ] && mv "$PROD" "$PREV"
mv "$STAGING" "$PROD"

# A process that is NOT ours holding :3000 is the one failure this script cannot
# recover from: systemd's new instance cannot bind, `Restart=always` turns it
# into a crash loop, and the rollback then fails for the same reason — which is
# exactly how the site went down on 2026-08-18 (and once before; GO-LIVE §1).
# A hand-run `npm start` is all it takes. So: look before restarting, and say
# what was in the way rather than leaving it in a journal nobody is reading.
echo "── port check ─────────────────────────────────────────────"
SQUATTER=$(ss -tlnpH "sport = :3000" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
for pid in $SQUATTER; do
  # Anything systemd started is in the unit's cgroup and will be cleaned up by
  # the restart below. Anything else is a squatter and has to go first.
  if grep -qs 'jipbap' "/proc/$pid/cgroup"; then continue; fi
  echo "killing a non-systemd process on :3000 — pid $pid: $(tr '\0' ' ' < /proc/$pid/cmdline)"
  sudo kill "$pid" || true
done
sleep 2

echo "── restart ────────────────────────────────────────────────"
sudo systemctl restart jipbap

# Answering, not merely started: a unit about to crash-loop is "active" for a
# second or two. `next start` needs a moment to bind.
live() {
  for _ in $(seq 1 20); do
    # stderr silenced: the first attempts fail by design while the server
    # boots, and an error per attempt makes a healthy deploy look broken.
    if curl -fsS -o /dev/null http://localhost:3000/ 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

if live; then
  echo "live — $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
  exit 0
fi

# ── roll back ──────────────────────────────────────────────────────────────
# The new build compiled and still does not serve. Whatever is wrong with it,
# the previous one was answering sixty seconds ago, and a site that is up is
# worth more than a diagnosis.
echo "FAILED: nothing answering on :3000 after 20s — rolling back" >&2
if [ -d "$PREV" ]; then
  rm -rf "$PROD"
  mv "$PREV" "$PROD"
  sudo systemctl restart jipbap
  if live; then
    echo "rolled back to the previous build; the site is up. The bad build is gone —" >&2
    echo "rebuild to inspect it:  cd app && NEXT_DIST_DIR=.next-staging npx next build" >&2
  else
    echo "ROLLBACK ALSO FAILED — the site is down." >&2
    echo "  journalctl -u jipbap -n 50 --no-pager" >&2
  fi
else
  echo "no previous build to roll back to." >&2
fi
echo "  journalctl -u jipbap -n 50 --no-pager" >&2
exit 1
