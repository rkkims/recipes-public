#!/bin/bash
# Regenerate the jipbap traffic report from nginx logs.
#
# Reads ONLY jipbap.access.log, so the wedding site on this same box stays out
# of these numbers -- both vhosts share nginx but not this log.
#
# --anonymize-ip because PRIVACY-SPEC treats an IP as personal data and a
# traffic report has no need of one. GoAccess still counts unique visitors; it
# just cannot show you who they were.
set -euo pipefail

OUT=/var/www/jipbap-stats/index.html
TMP=/var/www/jipbap-stats/.new.html

LOGS=(/var/log/nginx/jipbap.access.log)
[[ -f /var/log/nginx/jipbap.access.log.1 ]] && LOGS+=(/var/log/nginx/jipbap.access.log.1)

# ── two rewrites before GoAccess sees a line ─────────────────────────────
#
# 1. Strip `_rsc`. This is an App Router app: clicking a link fetches the same
#    page as an RSC payload at `?c=thai&_rsc=1r34m`, and the hash changes per
#    build. Left alone, one page appears as a dozen different rows and the
#    top-pages panel is unreadable. Stripping the parameter keeps the
#    navigation counted and puts it on the row it belongs to.
#
# 2. Drop assets. `/_next/static`, icons and the service worker are requests
#    but not visits, and they were three quarters of the volume.
#
# Visitor counts are unaffected by either: a visitor is counted from the lines
# that remain, and every real visitor requests at least one page.
zcat -f "${LOGS[@]}" \
  | sed -E 's/&_rsc=[^ &"]*//g; s/\?_rsc=[^ &"]*//g; s#(GET|POST) /&#\1 /?#' \
  | grep -vE '"(GET|HEAD) /(_next/static|icons?/|favicon|apple-touch|manifest|sw\.js|robots\.txt|sitemap)' \
  | goaccess - \
      --log-format=COMBINED \
      --anonymize-ip \
      --ignore-crawlers \
      --agent-list \
      --http-protocol=no \
      --tz=America/New_York \
      --html-report-title="jipbap traffic" \
      -o "$TMP"

mv "$TMP" "$OUT"
chmod 644 "$OUT"
