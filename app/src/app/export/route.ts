/**
 * Everything this owner has, as a file they can keep.
 *
 * There are no accounts (USER-SPEC §3, Phase A), so a user's pantry, cook
 * history, notes, plans and own recipes are keyed to one httpOnly cookie. That
 * is a reasonable Phase A shortcut and an unreasonable thing to leave silent:
 * the amount at risk grows precisely with how much the product has worked, and
 * a user forty items and a dozen cooks in has no idea they are one cleared
 * cookie from losing all of it.
 *
 * Until accounts exist, the honest mitigation is a door out. A route rather
 * than a server action because the browser must be able to SAVE the result —
 * an action returns a value to JavaScript, and what is wanted here is a file.
 *
 * It is the whole owner record verbatim, not a curated subset: the point is
 * that nothing is held back, and a shape that matches the store is the shape
 * an import could one day read.
 */
import { getOwner } from "@/lib/store";
import { householdEvents } from "@/lib/events";
import { ownerId } from "@/lib/owner";

export async function GET() {
  const id = await ownerId();
  const owner = getOwner(id);

  if (!owner) {
    return new Response(
      JSON.stringify({ error: "Nothing saved on this device yet." }, null, 2),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  // Date only: a file named for the second it was downloaded sorts badly and
  // reads like a machine artefact. A person wants "the one from Tuesday".
  const day = new Date().toISOString().slice(0, 10);

  // The owner record is the state; the events are how it got that way, and the
  // policy's "everything held against your browser" covers both. Kept under
  // its own key rather than merged in, so the top level still matches the store
  // — the shape an import could one day read (above) survives the addition.
  const body = { ...owner, events: householdEvents(id) };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Named for the product, not for the sentence it used to be called.
      "content-disposition": `attachment; filename="jipbap-${day}.json"`,
      // Never cached and never shared: this is one person's entire record.
      "cache-control": "no-store, private",
    },
  });
}
