/**
 * Which version of the terms an account agreed to.
 *
 * Bumped when `legal/terms.md` changes in a way that alters what someone was
 * agreeing to — not for a typo. It is stored on every user record at sign-up
 * (`User.terms`), so "what did they accept" is answerable later without
 * archaeology on git history.
 *
 * A separate file from `lib/consent.ts` on purpose. That one versions the
 * data-sharing permission, which is a different promise, given at a different
 * moment, and withdrawable on its own. Two versions in one constant is how they
 * end up bumped together and neither meaning anything.
 */
export const TERMS_VERSION = "1.0";
