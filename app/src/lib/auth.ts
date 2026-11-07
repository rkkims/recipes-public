/**
 * Passwords and session tokens. The crypto, and nothing else.
 *
 * ── What this is deliberately not ──────────────────────────────────────────
 *
 * There is no email verification, no password policy, no reset flow, no rate
 * limiter, no OAuth. That is a decision, not a backlog: the account exists so a
 * library survives a cleared cookie, and every one of those adds a step between
 * a person and the thing they came for. SuperCook has run for fifteen years on
 * an email, a password typed twice, and nothing else.
 *
 * The two things that are NOT negotiable, because they are the ones that hurt
 * real people rather than costing them a minute:
 *
 *   - **A password is never stored, in any recoverable form.** People reuse
 *     passwords. A plaintext or fast-hashed store here is a breach of every
 *     other site they use, not just this one, and no amount of "it's only a
 *     recipe app" changes that arithmetic.
 *   - **Comparisons are timing-safe.** A `===` on a hash leaks it a byte at a
 *     time to anyone patient.
 *
 * ── scrypt, from the standard library ─────────────────────────────────────
 *
 * `node:crypto` has it, so there is no dependency to audit and nothing to keep
 * up to date. It is memory-hard by design, which is what makes a stolen hash
 * expensive to attack with the GPUs that make bcrypt-era parameters look thin.
 * The cost parameters travel INSIDE each stored hash, so raising them later
 * upgrades new passwords without invalidating old ones.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  pw: string | Buffer, salt: string | Buffer, len: number, opts: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * ~100ms on this machine, which is the usual target: slow enough to make a
 * stolen file expensive, fast enough that nobody notices signing in.
 *
 * Stored per hash rather than read from here at verify time — see `verify`.
 */
const N = 16384, R = 8, P = 1, KEYLEN = 64;

/** `scrypt$N$r$p$salt$hash`, all base64url. Self-describing on purpose. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Parameters come from the STORED string, not from the constants above, so a
 * hash written under older settings still verifies after they are raised.
 * Returns false rather than throwing on anything malformed: a corrupt row is a
 * failed login, not a 500 that tells the caller a row exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const want = Buffer.from(hash, "base64url");
    const got = await scrypt(password, Buffer.from(salt, "base64url"), want.length,
                             { N: Number(n), r: Number(r), p: Number(p) });
    // Equal lengths are a precondition of `timingSafeEqual`, and it throws
    // rather than returning false if they differ.
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

/**
 * A session token: 32 random bytes.
 *
 * The token IS the credential — it is stored as the key of the session record,
 * so anyone holding it is that user until it is deleted. That is the same trade
 * every cookie session makes, and it is why the cookie is `httpOnly` and
 * `secure`. 256 bits of `randomBytes` is not guessable.
 */
export const newToken = () => randomBytes(32).toString("base64url");

/** Ids that say what they are when you find one in a file. */
export const newUserId = () => "usr_" + randomBytes(9).toString("base64url");

/**
 * The one thing checked about an email, and it is not a validity test.
 *
 * There is no verification, so this cannot and does not try to establish that
 * the address exists or that the user owns it. It is the login handle, and the
 * only requirements are that it has a shape people recognise as an email and
 * that it matches on the way back in. Lowercased and trimmed, because somebody
 * WILL sign up with a capital and sign in without it.
 */
export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/**
 * The sign-up id — CREATORS-TAB-SPEC §6: accounts take an id, not an email,
 * so the store holds nothing that identifies a person unless they chose to
 * leave a recovery address.
 *
 * Case-folded like the email always was, so "Maria" and "maria" cannot be two
 * accounts one keyboard apart. The `@` is excluded by the character set,
 * which is also what lets sign-in take one field for both: an entry with an
 * `@` is an email, anything else is an id, and no id can impersonate an
 * address.
 */
export function normaliseUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(u) ? u : null;
}
