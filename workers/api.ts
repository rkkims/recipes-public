/**
 * The behavioural sink, as a Worker — STATIC-SPEC §7b, revised 2026-08-24.
 *
 * A faithful port of `app/src/app/api/events/route.ts`: the same six kinds, the
 * same allowlist per kind, the same silent 204 for everything else. The route
 * it replaces stays exactly where it is — in server mode nothing is routed
 * here, and the two are meant to be interchangeable so that the cutover is a
 * DNS act rather than a behavioural one, the same promise `workers/go.ts`
 * makes.
 *
 * Deployed by:  npx wrangler deploy -c deploy/cloudflare/wrangler-api.toml
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * §7b retired `/api/events` on the reading that the beacons could go to the
 * `/go` Worker's dataset or stop. They stopped, and that quietly cost the one
 * number GO-LIVE's distribution plan is measured by: residency is
 * `cook_event`, so firing a community placement into a build with no event
 * sink is flying blind. The privacy argument that kept them OUT of the `/go`
 * dataset still holds — a click log with nothing personal in it and a
 * behavioural log keyed by household are different records with different
 * arguments — so they get a table of their own rather than a corner of that
 * one.
 *
 * ── One endpoint, and the list stays closed ───────────────────────────────
 *
 * `POST /api/events`. Nothing else, on any path or method: §0b's contract is
 * curate, add a recipe, map products, and every endpoint beyond that is
 * operational surface someone has to watch. Accounts, sync and claims are named
 * in §7b as this Worker's future tenants; each one arrives with its own test
 * against that contract, not as a convenience because a Worker already exists.
 *
 * ── The record's discipline, restated ─────────────────────────────────────
 *
 * Everything is validated against an allowlist per kind and dropped silently
 * otherwise: this endpoint is reachable by anyone, and the record's worth rests
 * on nothing entering it that the product did not emit. No free text, no user
 * id, bounded sizes. A rejected beacon is a 204 like any other, because an
 * attacker probing for a difference should not find one — and `txt_` ids are
 * refused outright, because a free-text pantry row is the user's own words and
 * must never reach the log (BEHAVIOR-SPEC §6).
 */

type Env = {
  /** D1, bound as `DB` — see `deploy/cloudflare/wrangler-api.toml`. */
  DB?: {
    prepare(sql: string): {
      bind(...values: unknown[]): { run(): Promise<unknown> };
    };
  };
};

/**
 * The two origins this Worker answers, and never `*`.
 *
 * CORS is not needed after the cutover — the Worker is routed at
 * `jipbap.com/api/*`, so the site and the API share an origin — but a preview
 * site on workers.dev is cross-origin, and a beacon that cannot be sent from
 * the preview cannot be tested before it matters. So the two known origins are
 * named, exactly, and anything else gets no allow header.
 *
 * Exact strings, never a suffix test: `jipbap.com.evil.example` is the same
 * class of mistake `workers/go.ts` refuses in its host allowlist.
 */
const ORIGINS = new Set([
  "https://jipbap.com",
  "https://jipbap.richard-k-kim-work.workers.dev",
]);

const ID = /^[\w-]{1,64}$/;
const okId = (v: unknown): v is string =>
  typeof v === "string" && ID.test(v) && !v.startsWith("txt_");

const okN = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;

/**
 * A moment the sender claims — bounded and parseable, nothing more. It is
 * the client's clock and treated as such downstream; what matters here is
 * that free text cannot ride in through a date field.
 */
const okWhen = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** BEHAVIOR-SPEC §4's vocabulary — mirrors `PantrySource` in `lib/events`. */
const PANTRY_SOURCES = new Set(["manual", "first_run", "gap_resolution", "import", "cook"]);

/** What the sender is allowed to have said, or null. The one place the six
    kinds are described, so the Worker and the route cannot drift apart in
    what they accept — only in where they put it. */
function accept(body: Record<string, unknown>):
  { kind: string; household: string | null; payload: Record<string, unknown> } | null {
  switch (body["kind"]) {
    case "list_viewed":
      return okN(body["n"])
        ? { kind: "list_viewed", household: null, payload: { n: body["n"] } }
        : null;

    case "buyblock_shown": {
      const ids = Array.isArray(body["ingredient_ids"])
        ? body["ingredient_ids"].filter(okId).slice(0, 100)
        : [];
      return ids.length > 0
        ? { kind: "buyblock_shown", household: null,
            payload: { surface: "list", n: ids.length, ingredient_ids: ids } }
        : null;
    }

    case "buyblock_opened":
      return okId(body["ingredient_id"])
        ? { kind: "buyblock_opened", household: null,
            payload: { ingredient_id: body["ingredient_id"] } }
        : null;

    /* The behavioural record's client half — the same three kinds `store.ts`
       appends on a server write, arriving as beacons from `client-store.ts`
       now that state lives on the device. Field for field what the server
       emits, and nothing else gets in. */
    case "pantry_event": {
      const op = body["op"];
      const source = body["source"];
      if (okId(body["household"]) && okId(body["node_id"]) &&
          (op === "add" || op === "remove") &&
          typeof source === "string" && PANTRY_SOURCES.has(source)) {
        return {
          kind: "pantry_event", household: body["household"],
          payload: {
            household: body["household"], node_id: body["node_id"], op, source,
            ...(body["from_list"] === true ? { from_list: true } : {}),
          },
        };
      }
      return null;
    }

    case "cook_event": {
      const source = body["source"];
      if (okId(body["household"]) && okId(body["cook_id"]) && okId(body["recipe_id"]) &&
          okWhen(body["cooked_at"]) &&
          (source === "planned" || source === "spontaneous")) {
        return {
          kind: "cook_event", household: body["household"],
          payload: {
            household: body["household"], cook_id: body["cook_id"],
            recipe_id: body["recipe_id"], cooked_at: body["cooked_at"], source,
          },
        };
      }
      return null;
    }

    case "cook_undo":
      return okId(body["household"]) && okId(body["cook_id"])
        ? { kind: "cook_undo", household: body["household"],
            payload: { household: body["household"], cook_id: body["cook_id"] } }
        : null;

    default:
      return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const cors: Record<string, string> = ORIGINS.has(origin)
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : { vary: "Origin" };

    /* A string body makes `sendBeacon` a simple request, so there is normally
       no preflight to answer. Answered anyway, and only for the two known
       origins: a browser that decides to ask must get a real answer rather
       than a 405 that reads as "the endpoint is broken". */
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: ORIGINS.has(origin)
          ? { ...cors, "access-control-allow-methods": "POST",
              "access-control-allow-headers": "content-type",
              "access-control-max-age": "86400" }
          : cors,
      });
    }

    /* One endpoint, and the path is checked rather than ignored — unlike
       `workers/go.ts`, which answers anywhere because everything it needs is
       in the query. This Worker is routed at `jipbap.com/api/*` after the
       cutover and will have neighbours (§7b's accounts and sync), so the path
       is the thing that tells them apart from the first day rather than the
       day the second one lands. */
    const { pathname } = new URL(req.url);
    if (req.method !== "POST" || pathname !== "/api/events") {
      return new Response(null, { status: 404, headers: cors });
    }

    try {
      const raw = await req.text();
      if (raw.length > 8192) return new Response(null, { status: 204, headers: cors });
      const row = accept(JSON.parse(raw) as Record<string, unknown>);
      if (row) {
        /**
         * One row per event, and the insert is awaited.
         *
         * ATTRIBUTION-SPEC §2's "nothing may ever wait on this" is a rule about
         * the CLIENT — the beacon is fired and forgotten before this is
         * reached, so waiting here costs the user nothing and buys the write a
         * real chance to land. `env.DB?.` survives a missing binding for the
         * same reason `env.CLICKS?.` does in the `/go` Worker: a Worker
         * deployed before its database exists must answer, not throw.
         */
        await env.DB?.prepare(
          "INSERT INTO events (kind, at, household, payload) VALUES (?, ?, ?, ?)",
        ).bind(row.kind, new Date().toISOString(), row.household,
               JSON.stringify(row.payload)).run();
      }
    } catch {
      /* malformed input is dropped, never reflected — and a database that
         refused must not turn into a visible failure on a page that has
         already moved on */
    }
    return new Response(null, { status: 204, headers: cors });
  },
};
