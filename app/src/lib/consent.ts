/**
 * The words beside the permission control, and the version they belong to.
 *
 * Isomorphic on purpose — no `node:` imports — because the client renders these
 * strings and the server hashes them, and there must be exactly one copy of the
 * text in the repo. Two copies is how a toggle comes to say something the policy
 * does not, and the consent record then attests to wording nobody can produce.
 *
 * **These strings are quoted verbatim in `legal/privacy-policy.md` §5.4.**
 * Changing a character here changes what users were told, which is a
 * `POLICY_VERSION` bump and, under §14 of that policy, a re-consent — the old
 * grant does not carry to new wording. See `lib/pool.ts`, which enforces it.
 */

/** The only purpose that exists. PRIVACY-SPEC §5. */
export const PURPOSE = "commercial_aggregate" as const;

/**
 * The published policy text in force.
 *
 * Bumped when `legal/privacy-policy.md` changes materially. `pool.ts` compares
 * this against each stored grant, so a bump empties the pool until people answer
 * again — which is the intended cost, not an accident to be worked around.
 */
export const POLICY_VERSION = "1.0";

export const CONSENT_HEADING = "Help shape what stores stock";

/**
 * The claim, not the mechanism.
 *
 * "We share counts" is what leaves; "never your pantry, your name, or anything
 * you wrote" is the safety. What is deliberately absent is any explanation of
 * how aggregation works, which is the repo's standing copy rule and also the
 * right call here — a user who needs the mechanism explained to decide is being
 * asked to audit us, and the policy is where that belongs.
 */
export const CONSENT_BODY =
  "We share counts, never your pantry, your name, or anything you wrote. " +
  "Change this any time.";

/** Exactly what a consent record attests to having been on screen. */
export const CONSENT_COPY = `${CONSENT_HEADING}\n${CONSENT_BODY}`;
