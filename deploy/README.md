# Deploying jipbap

One VM, one Next process, **nginx** in front. LAUNCH-V1 §3.

```
https://jipbap.com  ──nginx :443 (Let's Encrypt)──▶  next start :3000
                                                     reads  ../data/**
                                                     writes ../data/app/owners.json
```

**Live on `https://jipbap.com` since 2026-08-21.** Plain http, `www`, and the
bare IP all 301 to the canonical name. DNS is served by **Cloudflare**
(registration stays at domain.com; only the nameservers moved, after
worldnic took two hours to agree with itself about one A record). The A
records are **DNS only — grey cloud — on purpose**: the proxy would put
Cloudflare's IPs in the nginx logs and blind the GoAccess stats below. If the
proxy is ever adopted, land nginx real-IP config first, and ignore the
dashboard banner lobbying for orange until then.

**Email**: `hello@jipbap.com` (plus catch-all and `+tag` subaddresses) is
Cloudflare Email Routing forwarding to Richard's Gmail. It is DNS records and
a dashboard rule — nothing on this box receives or sends mail.

---

## What is already on this box

This is not an empty machine, and that is the single most important fact here.

- **nginx owns 80 and 443**, with certbot, serving `<other-site>` — a
  live site with real visitors.
- jipbap is a **second server block**, not a second web server. nginx routes by
  `Host` header, so any number of sites share one pair of ports; that is what
  `server_name` is for. Neither site has to move and neither needs its DNS
  changed.
- Caddy was installed here once, briefly, and removed. It could not bind because
  nginx already held the ports, which is the good outcome of a bad idea: two web
  servers competing for 80/443 is how a live site goes down at 3am. **Do not
  install a second web server on this box.**

## Files

| | |
|---|---|
| `nginx-jipbap-domain.conf` | **what is live** (installed 2026-08-21, with cert lines filled in): named vhosts on :80/:443, redirects to canonical, `/curate` and `/_stats` locked |
| `nginx-jipbap.conf` | the IP-era config it replaced. Kept as history; if a location exists here, it must exist in the domain conf too — `/_stats` was lost in the cutover precisely because it did not |
| `jipbap.service` | the systemd unit that keeps `next start` running |
| `deploy.sh` | typecheck → build → back up `owners.json` → restart → wait for :3000 |

## Shipping a change

```sh
./deploy/deploy.sh
```

Typechecks first so a broken tree never becomes a broken build, builds into
`.next-prod`, snapshots `owners.json` **before** restarting so a bad ship still
has the state that was live a minute ago, then polls until the port actually
answers rather than declaring success on a unit about to crash-loop.

**If the release changes how a page looks, bump `VERSION` in
`app/public/sw.js` first.** Navigations are network-first, so most deploys are
picked up without it. The case that bites is a fetch that fails — and a restart
is a fetch that fails. Anyone who reloads during one gets the cached copy of
that page and keeps it until a network load succeeds, which is how a deploy
comes to look like it did nothing.

## The curation queue

`/curate` and `/curate/list` write to `data/curation/` and are locked with HTTP
basic auth in nginx, against `/etc/nginx/.htpasswd-curate`. In the proxy rather
than in the app, so a route the app adds later and forgets to guard cannot
bypass it.

```sh
# change the password
printf 'curate:%s\n' "$(openssl passwd -apr1)" | sudo tee /etc/nginx/.htpasswd-curate
sudo systemctl reload nginx
```

## The domain landed — 2026-08-21, and what the plan got wrong

The three-step plan above this section used to say: copy the config, reload,
then run `certbot --nginx`. That order **cannot work**: the domain config's
443 blocks say `listen 443 ssl` and the certificate lines were commented out
waiting for certbot — so `nginx -t` fails before certbot can ever run. The
order that shipped:

1. `A` records pointed at `<server-ip>`, waited out propagation.
2. `sudo certbot certonly --nginx -d jipbap.com -d www.jipbap.com` — the cert
   first, obtained against the *old* running config, no rewrite.
3. Installed the domain config **with the cert lines filled into both 443
   blocks by hand** (the www-redirect block needs them too — a comment saying
   "same certificate as below" does not terminate TLS), `nginx -t`, reload.
4. Deleted `INSECURE_COOKIES=1` from `app/.env.production` and redeployed —
   session cookies carry `secure` now, and the TLS-gated service worker and
   PWA install work.

The other lesson is in the files table: the cutover **silently dropped
`/_stats`**, because the location lived only in the IP-era config and the
copy replaced the whole file. It was caught on a runbook re-read hours later.
Renewal is proven (`certbot renew --dry-run` passed for both sites, after the
DNS move to Cloudflare too); renewals ride the open ACME location in the :80
block and need nginx running, nothing more.

## Checks

```sh
curl -sI https://jipbap.com/          | head -1   # 200
curl -sI https://jipbap.com/curate    | head -1   # 401
curl -sI https://jipbap.com/_stats/   | head -1   # 401
curl -sI https://jipbap.com/privacy   | head -1   # 200
curl -sI http://jipbap.com/           | head -1   # 301 → https
curl -sI https://www.jipbap.com/      | head -1   # 301 → apex
sudo systemctl status jipbap nginx
journalctl -u jipbap -f
```

And the one that matters: open it on a phone and cook from it.

## Two things share this machine

**The curation session on :5173 reads `.next`.** Production reads `.next-prod`.
That split is why `next.config.mjs` takes `NEXT_DIST_DIR`, and why the deploy
script never touches `.next` — a production build rewriting it mints a new
BUILD_ID and 404s the chunks the reviewer's open tab is holding.

**`data/app/owners.json` is production data**, and since accounts landed it also
holds password hashes and live session tokens. It is the one file here that
cannot be regenerated. The deploy script snapshots it into `data/backup/` on
every ship and keeps 14 days — which covers a bad deploy and **not** losing the
VM. Backups going off the machine is still to do, and it now matters more than
it did, because those snapshots contain credentials.

## Traffic stats — GoAccess

No third-party analytics, no script in anyone's browser, no cookie banner, and
nothing new in the privacy policy: this reports on the nginx logs that policy
already discloses.

    https://jipbap.com/_stats/     user `jipbap`, password in the box's .htpasswd-stats

Pieces, all in this directory:

| file | goes to |
|---|---|
| `jipbap-stats.sh` | `/usr/local/bin/jipbap-stats` (chmod +x) |
| `jipbap-stats.service` | `/etc/systemd/system/` |
| `jipbap-stats.timer` | `/etc/systemd/system/` |

    sudo apt-get install -y goaccess apache2-utils
    sudo mkdir -p /var/www/jipbap-stats
    sudo htpasswd -c /etc/nginx/.htpasswd-stats jipbap
    sudo systemctl daemon-reload && sudo systemctl enable --now jipbap-stats.timer

The report regenerates every 15 minutes into `/var/www/jipbap-stats/index.html`
and nginx serves that file directly. The app is not involved and cannot be
slowed down by it.

### Two things the script does before GoAccess sees a line

**Strips `_rsc`.** This is an App Router app, so following a link fetches the
same page as an RSC payload at `?c=thai&_rsc=1r34m`, and that hash changes every
build. Left alone one page appears as a dozen rows and the top-pages panel is
unreadable. Stripping it keeps the navigation counted on the row it belongs to.

**Drops assets.** `/_next/static`, icons and the service worker are requests but
not visits, and they were about three quarters of the volume.

Neither affects visitor counts.

### Caveats

**Basic auth over plain HTTP is cleartext.** Until jipbap.com has a certificate,
the stats password crosses the network in the clear. It is its own credential,
shared with nothing, so the blast radius is the traffic report — but do not
reuse it, and rotate it once TLS is up.

**Only jipbap.** It reads `jipbap.access.log`, never the shared `access.log`,
so the wedding site on this box is not in these numbers.

**IPs are anonymised** (`--anonymize-ip`). Unique visitors are still counted;
they just cannot be traced back to a person.

## Backups

Two directories, for two different reasons.

**`data/app/`** exists nowhere else at all — accounts, pantries, cook logs, bug
reports. The corpus, the ontology, the curation CSVs and every line of code are
in git and on a remote; these are not and cannot be. Losing it is
unrecoverable.

**`data/enriched/`** is re-creatable, and only by re-crawling ~4,900 pages on
other people's servers over several hours. It is gitignored, so nothing else
holds a copy. Expensive enough to treat as precious.

Together they gzip to about 115KB, which is why the script can afford to be
paranoid and to keep three days of them.

    sudo cp deploy/jipbap-backup.sh /usr/local/bin/jipbap-backup
    sudo chmod +x /usr/local/bin/jipbap-backup
    sudo cp deploy/jipbap-backup.{service,timer} /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable --now jipbap-backup.timer

Hourly, 72 snapshots kept (three days), in `/var/backups/jipbap`. Mode 600
under a 700 directory, because these archives contain scrypt password hashes
and live session tokens — a world-readable backup is a credential leak with a
timestamp on it.

### The two rules that make it a backup and not a copy

**It validates before keeping.** A snapshot of a truncated `owners.json` is
worse than no snapshot: it looks like a restore point and is not. The JSON is
parsed before the file is accepted and again after it is read back out of the
archive, and a failure exits non-zero so systemd records it.

**It never rotates on a failed run.** Pruning happens only after a snapshot has
verified, so a week of failures leaves a week-old backup rather than an empty
directory.

Both were tested by pointing it at a deliberately truncated file: it refused,
exited 1, and left the good snapshot in place.

### Restoring

    sudo systemctl stop jipbap
    # The archive holds `app/` and `enriched/`, so it extracts over `data/`.
    sudo tar -xzf /var/backups/jipbap/app-<stamp>.tar.gz -C /home/ubuntu/recipes/data
    sudo chown -R ubuntu:ubuntu /home/ubuntu/recipes/data/app /home/ubuntu/recipes/data/enriched
    sudo systemctl start jipbap

To take back only the accounts and leave the enrichment alone:

    sudo tar -xzf /var/backups/jipbap/app-<stamp>.tar.gz -C /home/ubuntu/recipes/data app

Verified: an extracted `owners.json` is byte-identical to the live file, and a
restored `enriched/` parses to all 4,874 rows across 15 files.

### Off the box

**Not yet configured, and until it is this is a snapshot on the same disk as
the original** — it survives a bad write, not a dead VM. To finish it:

    echo 'JIPBAP_BACKUP_GCS=gs://<bucket>/jipbap' | sudo tee /etc/default/jipbap-backup
    sudo systemctl start jipbap-backup

The script copies with `gsutil` when that variable is set and keeps the local
snapshot regardless, so a failed upload degrades to what exists today rather
than losing the run.
