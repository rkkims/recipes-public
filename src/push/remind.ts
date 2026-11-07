/**
 * Send the one notification this product is allowed to send — UX-SPEC §12.
 *
 *   npm run remind -- --dry
 *   npm run remind
 *
 * §12 spends the notification permission on exactly one thing:
 *
 *   *"'Use first' is the entire urgency mechanism, and a pin is the user telling
 *   us something is dying. Without a way to reach them later, that signal
 *   expires unused in a tab nobody reopened. Push is what turns a pin into an
 *   action."*
 *
 * And it names the hard limits, which this file exists to obey rather than to
 * interpret: **only ever from a user-initiated pin. Never re-engagement, never
 * "new recipes this week", never anything the user did not personally ask for by
 * pinning.**
 *
 * ── What it sends, and when ───────────────────────────────────────────────
 *
 * A pin lapses after `PIN_DAYS` (7). The useful moment is shortly BEFORE that:
 * telling someone their scallions are about to stop being urgent is a reminder;
 * telling them afterwards is a note about the past. So it reminds on day 5 and 6
 * of a live pin — late enough to be urgent, early enough to act on, and at most
 * twice per pin.
 *
 * ── Why a script and not a route ──────────────────────────────────────────
 *
 * Nothing in the app should be able to trigger a send. A route that sends
 * notifications is a route that can be called twice, or by anyone who guesses
 * it. This runs from cron, reads the owner file, and writes back only the record
 * of what it sent.
 */
import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OWNERS = resolve(ROOT, "data/app/owners.json");
const ENV = resolve(ROOT, "app/.env.local");

/** Days a pin lives — must agree with `app/src/lib/store.ts`. */
const PIN_DAYS = 7;
/** Remind on these days of a pin's life. Two chances, both before it lapses. */
const REMIND_ON = [5, 6];

type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; dead_at?: string };
type Ingredient = {
  ingredient_id: string; in_pantry: boolean; use_first: boolean;
  pinned_at?: string; label?: string;
};
type Owner = {
  id: string;
  ingredients: Record<string, Ingredient>;
  push?: Sub[];
  /** ingredient id → the pin-day we last reminded about, so nothing repeats. */
  reminded?: Record<string, number>;
};

/** `.env.local` is not loaded for a plain tsx script; read it ourselves. */
function env(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(ENV)) return out;
  for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !line.startsWith("#")) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const dayOfPin = (pinnedAt: string): number =>
  Math.floor((Date.now() - Date.parse(pinnedAt)) / 86_400_000);

async function main() {
  const dry = process.argv.includes("--dry");
  const e = env();
  const pub = e["VAPID_PUBLIC_KEY"], priv = e["VAPID_PRIVATE_KEY"];
  const subject = e["VAPID_SUBJECT"] ?? "mailto:nobody@example.com";
  if (!pub || !priv) {
    console.log("no VAPID keys in app/.env.local — nothing can be sent");
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);

  const db = JSON.parse(readFileSync(OWNERS, "utf8")) as { owners: Record<string, Owner> };
  let sent = 0, dead = 0, considered = 0;

  for (const owner of Object.values(db.owners)) {
    const subs = (owner.push ?? []).filter((s) => !s.dead_at);
    if (subs.length === 0) continue;

    for (const row of Object.values(owner.ingredients ?? {})) {
      /* A pin, still live, and one the user set themselves. Nothing else in the
         file is grounds for reaching them. */
      if (!row.use_first || !row.in_pantry || !row.pinned_at) continue;
      const day = dayOfPin(row.pinned_at);
      if (day >= PIN_DAYS) continue;              // lapsed; the moment has gone
      if (!REMIND_ON.includes(day)) continue;
      considered++;

      owner.reminded ??= {};
      if ((owner.reminded[row.ingredient_id] ?? -1) >= day) continue;   // already told them today

      const name = row.label ?? row.ingredient_id;
      const left = PIN_DAYS - day;
      const payload = JSON.stringify({
        title: `Use your ${name}`,
        body: left === 1
          ? "You marked this to use first — it drops off tomorrow."
          : `You marked this to use first — ${left} days left.`,
        url: "/",
        /* One notification per ingredient: a second reminder REPLACES the first
           rather than stacking, because two lines about one scallion is nagging. */
        tag: `use-first-${row.ingredient_id}`,
      });

      if (dry) { console.log(`  would send: ${owner.id} · ${name} · day ${day}`); sent++; continue; }

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys }, payload);
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          /* 404 and 410 are the only answers that mean "this endpoint is gone
             forever". Anything else is the service having a bad day and must
             NOT delete a working subscription. */
          if (code === 404 || code === 410) { sub.dead_at = new Date().toISOString(); dead++; }
        }
      }
      owner.reminded[row.ingredient_id] = day;
    }
  }

  console.log(`${considered} pin(s) in the reminder window · ${sent} sent · ${dead} dead endpoint(s)`);
  if (dry) { console.log("\n(dry run — nothing sent, nothing written)"); return; }
  writeFileSync(OWNERS, JSON.stringify(db, null, 2));
}

void main();
