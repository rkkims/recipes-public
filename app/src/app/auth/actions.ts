"use server";

/**
 * Sign up, sign in, sign out. The only three.
 *
 * ── Deliberately small ────────────────────────────────────────────────────
 *
 * No email verification, no password rules, no reset, no OAuth. UX-SPEC §9 puts
 * the ask after the product has been useful and forbids taxing the first
 * session; a verification email is a tax collected before the account does
 * anything, on an address we have no reason to doubt and no way to check
 * cheaply. SuperCook has run this way for fifteen years.
 *
 * What that costs, stated: an address can be mistyped, and there is then no way
 * back into the account. That is the honest price of the simplicity, and it is
 * why the export link exists and why the pantry keeps working signed out.
 *
 * ── Signing up moves nothing ──────────────────────────────────────────────
 *
 * The visitor already has an owner record with their pantry in it. `createUser`
 * attaches the account to THAT id (USER-SPEC §3 — private state keys on
 * `owner_id`), so twenty ingredients and a week of cooks survive the sign-up
 * without a migration, a copy, or a moment where they exist twice.
 */
import { cookies } from "next/headers";
import { currentUser, ownerId, OWNER_COOKIE, SESSION_COOKIE } from "@/lib/owner";
import { createUser, deleteAccount as deleteAccountRow, endSession, startSession,
         userByIdentifier } from "@/lib/store";
import { hashPassword, newToken, normaliseEmail, normaliseUsername,
         verifyPassword } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { attempt, type ActionResult } from "@/lib/result";
import { revalidatePath } from "next/cache";

/** A year. A recipe library is not a banking session. */
const SESSION_DAYS = 365;

async function setSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    /*
      Secure unless explicitly told otherwise.

      A `secure` cookie over plain http is a cookie the browser silently
      DROPS: no error, no warning, the sign-in just does nothing. So this
      cannot key on `NODE_ENV` — a production build served over http, which
      is exactly what jipbap runs on until the domain is bought and Let's
      Encrypt can issue for it, would set a flag that breaks the feature.

      `INSECURE_COOKIES=1` is the pre-TLS escape hatch, set in
      `.env.production` and deleted the moment HTTPS is on. It defaults to
      secure, so forgetting it is a broken login rather than a session cookie
      travelling in the clear — the failure that shouts rather than the one
      that does not.
    */
    secure: process.env.NODE_ENV === "production"
            && process.env["INSECURE_COOKIES"] !== "1",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

/**
 * An id, not an email — CREATORS-TAB-SPEC §6, settled 2026-08-15: the account
 * takes a username so the store holds nothing that identifies a person. The
 * recovery address is the one optional exception, empty by default, stored
 * against the day a reset flow exists.
 */
export async function signUp(form: {
  username: string; recovery?: string; password: string; confirm: string; terms: boolean;
}): Promise<ActionResult> {
  return attempt(async () => {
    const username = normaliseUsername(form.username);
    if (!username) throw new Error(
      "Pick an id of 3–30 letters, numbers, dots, dashes or underscores.");
    const recovery = form.recovery?.trim() ? normaliseEmail(form.recovery) : null;
    if (form.recovery?.trim() && !recovery)
      throw new Error("That does not look like an email address. It is optional; leave it empty if you prefer.");
    /* Typed twice, and no rules about what it contains. The second field is the
       whole defence against a typo, since there is no reset. */
    if (!form.password) throw new Error("Pick a password.");
    if (form.password !== form.confirm) throw new Error("The two passwords are not the same.");
    /* The one thing that must be true before an account exists, because it is
       the thing the account is agreeing to. Checked on the SERVER: a required
       checkbox is a hint to the browser, not a guarantee to us. */
    if (!form.terms) throw new Error("Please accept the terms to create an account.");

    const user = createUser(await ownerId(),
                            { username, ...(recovery ? { email: recovery } : {}) },
                            await hashPassword(form.password),
                            { version: TERMS_VERSION });
    const token = newToken();
    startSession(token, user.id);
    await setSession(token);
    revalidatePath("/", "layout");
  });
}

/** One field for both: an entry with an `@` is an email (accounts from before
    ids existed, or a recovery address), anything else is an id. */
export async function signIn(form: { id: string; password: string }): Promise<ActionResult> {
  return attempt(async () => {
    const ident = form.id.includes("@")
      ? normaliseEmail(form.id)
      : normaliseUsername(form.id);
    const user = ident ? userByIdentifier(ident) : null;
    /* One message for "no such account" and "wrong password", so this cannot be
       used to find out which ids have accounts. The password is still
       verified against a throwaway hash when the user is missing, so the two
       paths take the same time and the timing does not answer it either. */
    const ok = user
      ? await verifyPassword(form.password, user.pw)
      : (await verifyPassword(form.password, await hashPassword("no such user")), false);
    if (!user || !ok) throw new Error("That id and password do not match.");

    const token = newToken();
    startSession(token, user.id);
    await setSession(token);
    revalidatePath("/", "layout");
  });
}

export async function signOut(): Promise<ActionResult> {
  return attempt(async () => {
    const jar = await cookies();
    /* The session row goes first. Deleting only the cookie would leave a live
       token in the file that anyone holding a copy could keep using. */
    endSession(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
    revalidatePath("/", "layout");
  });
}

/**
 * Close the account and destroy everything behind it.
 *
 * ── Why this exists as a button rather than an email address ─────────────
 *
 * The privacy policy has always offered deletion, and the way to get it was to
 * write to a human. That is a promise kept by hand, which means kept slowly and
 * kept unevenly. It is also an automatic App Store rejection: guideline
 * 5.1.1(v) requires that an app offering account creation offer account
 * deletion inside the app, and this one has offered sign-up since v1.
 *
 * ── It is not undoable and does not pretend to be ────────────────────────
 *
 * No soft delete, no thirty-day grace, no tombstone row. Those exist to protect
 * a business from churn, and dressing one up as a kindness to the user is the
 * thing this product does not do. The confirmation is in the UI, where a
 * confirmation belongs; once this runs the rows are gone from `owners.json`.
 *
 * The export route is offered beside the button for exactly this reason: the
 * honest way to make deletion safe is to let someone take their data first,
 * not to keep a copy for them after they asked us not to.
 *
 * ── Both cookies, not just the session ───────────────────────────────────
 *
 * `owner` outlives sign-out by design — it is what keeps an anonymous pantry.
 * Here it must go too, or the next request would arrive holding the id of an
 * owner that no longer exists, and `ownerId()` would helpfully create it again:
 * an empty kitchen wearing the dead one's name.
 */
export async function deleteAccount(): Promise<ActionResult> {
  return attempt(async () => {
    const jar = await cookies();
    const user = await currentUser();
    // Nothing to delete is not a failure — a double submit is one request.
    if (user) deleteAccountRow(user.id);
    jar.delete(SESSION_COOKIE);
    jar.delete(OWNER_COOKIE);
    revalidatePath("/", "layout");
  });
}
