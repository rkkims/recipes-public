/**
 * The impression half of the funnel — ATTRIBUTION-SPEC §2's denominators.
 *
 * `outbound_click` has its own route (`/go`), because a click must be recorded
 * even with JS off. Impressions are the opposite case: they only exist as a
 * client-side fact ("the block rendered in a real browser"), so they arrive as
 * beacons. Server-rendering them would count crawlers and every revalidation.
 *
 * Everything here is validated against an allowlist per kind and dropped
 * silently otherwise: this endpoint is reachable by anyone, and the record's
 * worth rests on nothing entering it that the product did not emit. No free
 * text, no user id, bounded sizes — a rejected beacon is a 204 like any
 * other, because an attacker probing for a difference should not find one.
 */
import { appendEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 8192) return new Response(null, { status: 204 });
    const body = JSON.parse(raw) as Record<string, unknown>;

    switch (body["kind"]) {
      case "list_viewed": {
        if (okN(body["n"])) appendEvent("list_viewed", { n: body["n"] });
        break;
      }
      case "buyblock_shown": {
        const ids = Array.isArray(body["ingredient_ids"])
          ? body["ingredient_ids"].filter(okId).slice(0, 100)
          : [];
        if (ids.length > 0) {
          appendEvent("buyblock_shown", { surface: "list", n: ids.length, ingredient_ids: ids });
        }
        break;
      }
      case "buyblock_opened": {
        if (okId(body["ingredient_id"])) {
          appendEvent("buyblock_opened", { ingredient_id: body["ingredient_id"] });
        }
        break;
      }
      /* The behavioural record's client half — the same three kinds
         `store.ts` appends on a server write, arriving as beacons from
         `client-store.ts` once state lives on the device. Field for field
         what the server emits, and nothing else gets in: `okId` already
         refuses `txt_` ids, so free text stays out of the record here the
         same way the store keeps it out structurally (BEHAVIOR-SPEC §6). */
      case "pantry_event": {
        const op = body["op"];
        const source = body["source"];
        if (okId(body["household"]) && okId(body["node_id"]) &&
            (op === "add" || op === "remove") &&
            typeof source === "string" && PANTRY_SOURCES.has(source)) {
          appendEvent("pantry_event", {
            household: body["household"], node_id: body["node_id"], op, source,
            ...(body["from_list"] === true ? { from_list: true } : {}),
          });
        }
        break;
      }
      case "cook_event": {
        const source = body["source"];
        if (okId(body["household"]) && okId(body["cook_id"]) && okId(body["recipe_id"]) &&
            okWhen(body["cooked_at"]) &&
            (source === "planned" || source === "spontaneous")) {
          appendEvent("cook_event", {
            household: body["household"], cook_id: body["cook_id"],
            recipe_id: body["recipe_id"], cooked_at: body["cooked_at"], source,
          });
        }
        break;
      }
      case "cook_undo": {
        if (okId(body["household"]) && okId(body["cook_id"])) {
          appendEvent("cook_undo", { household: body["household"], cook_id: body["cook_id"] });
        }
        break;
      }
      default:
        break;
    }
  } catch {
    /* malformed input is dropped, never reflected */
  }
  return new Response(null, { status: 204 });
}
