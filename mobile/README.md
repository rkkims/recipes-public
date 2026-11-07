# Native shells

> **Deferred (2026-08-16).** Website first: nothing here ships until traffic is
> validated and the store fees are funded — see `DECISIONS.md` §8. This
> directory stays as the ready-to-build answer set for that day.

Two ways to be in a store, both wrapping the site that already exists. Neither
is a second app: there is one codebase, deployed once, and a copy fix ships to
every installed phone on the next deploy with no review queue.

**Nothing here can be built until jipbap.com resolves over HTTPS.** Both a TWA
and a Capacitor app bind to an origin, and both verify it. Everything in this
directory is written against `https://jipbap.com` and works the moment the
domain and certificate exist.

## What the web app already does

Built and live, so it needs no native code:

- **Installable PWA** — `app/src/app/manifest.ts`, standalone display, 192/512
  and maskable icons, a long-press shortcut to the grocery list.
- **Service worker** — the app opens with no signal instead of showing the
  browser's error page, and static assets never re-download.
- **Web push** — VAPID, wired end to end, used for the "use first" reminder.
- **Share target** — jipbap appears in the Android share sheet. A link shared
  from YouTube or TikTok opens `/my-recipes` with the URL already in the add
  form and the lookup already run. Works in the PWA and the TWA with no native
  code at all. **iOS does not support this**, which is what the iOS share
  extension below is for.

All of it is inert over plain HTTP: service workers need a secure origin, so
none of this is working on the current bare-IP deploy.

## Android — TWA (cheapest, do this first)

A Play listing wrapping the PWA. About a day, and Chrome renders it with no
address bar once the site vouches for the APK.

```sh
npm install
npx bubblewrap init --manifest https://jipbap.com/manifest.webmanifest
# twa-manifest.json here is the answer set; bubblewrap will offer to reuse it
npx bubblewrap build
```

Then the part that is easy to miss:

1. `bubblewrap build` prints the SHA-256 of the signing key.
2. Put it in `app/.env.production` as `ANDROID_CERT_SHA256=AB:CD:...`, and
   redeploy.
3. Confirm `https://jipbap.com/.well-known/assetlinks.json` lists it. That
   route serves an **empty array** until the variable is set — see the file for
   why that is the honest default.
4. After the first Play upload, Google re-signs with **its own** key under Play
   App Signing. That fingerprint is different, and it is the one that matters
   on real devices. Add it too, comma separated. Skipping this step is the
   single most common reason a shipped TWA shows an address bar.

## iOS and Android — Capacitor

`capacitor.config.ts` points the WebView at the live site, which keeps the
session cookie first-party and means auth needs no changes.

```sh
npm install
npx cap add android
npx cap add ios      # macOS only: needs Xcode and CocoaPods
npx cap open ios
```

Native projects are **not** committed here. Generate them on the machine that
builds; they are large, and the config that matters is in `capacitor.config.ts`.

### Apple will reject a wrapper

Guideline 4.2 rejects apps that are a repackaged website, and that is exactly
what this is until it does something a browser tab cannot. The one that fits
the product and is worth building:

**A share extension.** iOS has no Web Share Target, so the flow that already
works on Android has to be built natively: a share sheet entry that takes a URL
from Instagram, YouTube or TikTok and opens `jipbap.com/my-recipes?url=…`. The
receiving half is done and tested — only the extension is missing.

Second candidate, if one is not enough: barcode scanning into the pantry.

### Before submitting to either store

- **Account deletion** — done, at `/account`. Apple guideline 5.1.1(v).
- **Privacy labels** (App Store) and the **Data safety** form (Play). Declare
  email, IP and usage; `legal/privacy-policy.md` is the source of truth and is
  already accurate about the 14-day log retention.
- **Affiliate links are fine** — Weee sells physical goods, so no in-app
  purchase requirement applies.
- Screenshots, age rating, and a support URL. `hello@jipbap.com` is published
  in both legal documents and does not exist yet.

## Costs

| | |
|---|---|
| Apple Developer Program | $99/year, and a Mac or a CI runner |
| Google Play | $25 once |
