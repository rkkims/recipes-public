/**
 * Which owner is this request?
 *
 * USER-SPEC §3: private state keys on `owner_id`, never `user_id`. In Phase A
 * there are no users at all — one owner per browser, held in a cookie.
 *
 * The id is minted here but the ROW is created on first write (USER-SPEC §7),
 * so a crawler that loads the page leaves nothing behind.
 */
import { cookies } from "next/headers";
import { sessionUser, type User } from "./store";

/* Exported because deleting an account must clear it: an anonymous owner
   cookie that outlives its owner record would be re-created empty on the
   next request, wearing the dead kitchen's name. See `deleteAccount`. */
export const OWNER_COOKIE = "owner";
const TZ_COOKIE = "tz";
export const SESSION_COOKIE = "sid";

/**
 * The signed-in user, or null. The one place a session is read.
 *
 * Everything that wants to know "is there an account behind this request"
 * asks here, so there is a single definition of what that means and no page
 * inventing its own.
 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return sessionUser(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Which kitchen this request is about.
 *
 * A SESSION WINS over the anonymous cookie, and that ordering is the whole
 * feature. Sign in on a second device and that browser has its own `owner`
 * cookie pointing at an empty pantry; without this you would be looking at
 * somebody else’s kitchen while signed in as yourself.
 *
 * The anonymous cookie is left alone rather than rewritten. Signing out has to
 * put you back where you were, and a browser that had a pantry before it had
 * an account should still have it afterwards.
 */
export async function ownerId(): Promise<string> {
  const user = await currentUser();
  if (user) return user.owner_id;

  const jar = await cookies();
  const found = jar.get(OWNER_COOKIE)?.value;
  if (found) return found;
  return "own_" + Math.random().toString(36).slice(2, 14);
}

/** Remember the browser's zone. Not httpOnly — the client sets it too. */
export async function setTzCookie(tz: string): Promise<void> {
  const jar = await cookies();
  jar.set(TZ_COOKIE, tz, { sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

export async function setOwnerCookie(id: string): Promise<void> {
  const jar = await cookies();
  jar.set(OWNER_COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

/**
 * The viewer's IANA timezone, if the browser has told us.
 *
 * **Why this exists at all:** every date in the calendar is a LOCAL calendar
 * day, and the server does not run in the user's zone — this one runs in UTC.
 * Without it, "today" rolls over at 5pm in California, so the highlighted
 * square, the future/past split that decides whether "Made it" appears, and the
 * day a cook is filed under are all wrong for the whole evening.
 *
 * Not `getTimezoneOffset()`: an offset is not a zone, and it is wrong on the
 * other side of a DST boundary. The IANA name survives that.
 *
 * `undefined` until the browser reports it, which means the FIRST render for a
 * new visitor uses the server's zone. That is the honest limit of this approach
 * — a CDN geo header (`x-vercel-ip-timezone`, `cf-timezone`) would be right on
 * request one, and is the upgrade when this is deployed behind one.
 */
export async function ownerTz(): Promise<string | undefined> {
  const jar = await cookies();
  const tz = jar.get(TZ_COOKIE)?.value;
  // Validate here rather than at every use: a bad value would otherwise throw
  // inside `Intl` on a page render.
  if (!tz || !/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/.test(tz)) return undefined;
  return tz;
}
