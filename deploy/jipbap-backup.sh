#!/bin/bash
# Snapshot the data that is not in git and not cheap to rebuild.
#
# TWO directories, for two different reasons:
#
#   data/app        — accounts, pantries, cook logs, bug reports. Exists
#                     nowhere else at all. Losing it is unrecoverable.
#   data/enriched   — scraped prep/cook/lead times for 4,488 recipes. It IS
#                     re-creatable, and only by re-crawling ~4,900 pages on
#                     other people's servers over several hours. That is
#                     expensive enough to treat as precious, and it is
#                     gitignored, so nothing else is holding a copy.
#
# Together they gzip to about 115KB, which is why this can afford to be
# paranoid and to keep three days of them.
#
# Two rules that make this a backup rather than a copy:
#
#   1. VALIDATE BEFORE KEEPING. A snapshot of a truncated owners.json is worse
#      than no snapshot: it looks like a restore point and silently is not. The
#      JSON is parsed before the file is accepted and again after it is read
#      back out of the archive, and a failure exits non-zero so systemd records
#      it instead of rotating a good snapshot out for a bad one.
#   2. NEVER ROTATE ON A FAILED RUN. Pruning happens only after a snapshot has
#      been taken and verified, so a week of failures leaves a week-old backup
#      rather than an empty directory.
#
# Mode 600 under a 700 directory: these archives carry scrypt password hashes
# and live session tokens. A world-readable backup is a credential leak with a
# timestamp on it.
set -euo pipefail

DATA=/home/ubuntu/recipes/data
DEST=/var/backups/jipbap
KEEP=${JIPBAP_BACKUP_KEEP:-72}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST/app-$STAMP.tar.gz"

[[ -f "$DATA/app/owners.json" ]] || { echo "no owners.json under $DATA/app"; exit 1; }

# Rule 1: parse it before trusting it.
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$DATA/app/owners.json" \
  || { echo "owners.json does not parse — refusing to snapshot"; exit 1; }

umask 077
# `enriched` is included when it exists rather than required: a fresh checkout
# has not crawled yet, and a machine with no enrichment is not a broken one.
DIRS=(app)
[[ -d "$DATA/enriched" ]] && DIRS+=(enriched)
tar -czf "$OUT" -C "$DATA" "${DIRS[@]}"

# And parse it back OUT of the archive, so a broken tar cannot pass either.
python3 -c 'import json,sys,tarfile
t = tarfile.open(sys.argv[1])
f = t.extractfile("app/owners.json") or t.extractfile("./app/owners.json")
json.load(f)' "$OUT" || { rm -f "$OUT"; echo "archive did not verify"; exit 1; }

chmod 600 "$OUT"

# Off-box, if a destination is configured. Without one this is a snapshot on the
# same disk as the original, which survives a bad write and not a dead VM.
if [[ -n "${JIPBAP_BACKUP_GCS:-}" ]]; then
  gsutil -q cp "$OUT" "$JIPBAP_BACKUP_GCS/" || echo "off-box copy FAILED (local snapshot kept)"
fi

# Rule 2: only now.
ls -1t "$DEST"/app-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$OUT ($(stat -c%s "$OUT") bytes, $(ls -1 "$DEST"/app-*.tar.gz | wc -l) kept)"
