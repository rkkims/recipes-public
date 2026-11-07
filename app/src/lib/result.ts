/**
 * What a server action returns.
 *
 * Every write can fail — a full disk, a corrupt store (`StoreCorrupt`), a stale
 * id after a re-parse. The client used to call these as `void onUpdate(...)`,
 * which discards the rejected promise: the chip flips, nothing is saved, and the
 * user finds out at the end of the session or never.
 *
 * So actions never throw across the boundary. They return this, the caller shows
 * it, and a failed write looks like a failed write.
 */
/**
 * `T` is what a SUCCESSFUL write has to report back, and it defaults to nothing.
 *
 * Almost every action here has nothing to say beyond "it worked" — the page
 * revalidates and the new state is the answer. Importing a batch is the
 * exception: "added 43, skipped 7 you already had" cannot be read off the
 * result, and re-deriving it on the client would mean the client knowing the
 * dedupe rule.
 *
 * Defaulted so that `ActionResult` keeps meaning exactly what it meant at every
 * existing call site.
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? { value?: undefined } : { value: T }))
  | { ok: false; error: string };

export const OK: ActionResult = { ok: true };

/**
 * Run a write and convert any throw into a message a person can act on.
 *
 * The message is deliberately the error's own text: these are our errors, thrown
 * by our store, and they are written to be read by the one person using this.
 */
export async function attempt<T = void>(
  fn: () => T | Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value } as ActionResult<T>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Server-side, because the client only gets the string.
    console.error("[action]", msg);
    return { ok: false, error: msg };
  }
}
