# Privacy Policy

**jipbap** · Effective 10 August 2026 · Version 1.0

## The short version

- Your pantry is yours. We do not show it to anyone.
- We never sell your personal information. Not to anyone, not for any price.
- If you turn it on, we share **counts** — how many people have an ingredient,
  how demand moves — with grocers and food companies. Never your pantry, never
  your name, never anything you wrote.
- That sharing is off unless you turn it on, and you can turn it off again in
  one tap.
- You can take everything with you, or delete it, at any time, without telling
  us why.

The rest of this page is the same thing in detail. If the detail ever
contradicts the summary above, the detail governs — tell us, because that means
we wrote one of them badly.

---

## 1. Who we are

jipbap is a recipe and pantry service operated from the United States. "jipbap",
"we" and "us" mean the operator of this service.

For questions about anything here: **privacy@jipbap.com**.

## 2. What we keep

**Things you put in:**

| | |
|---|---|
| Your pantry | ingredients you have, what's on your grocery list, what you marked *use first* |
| Recipes | ones you saved, notes you wrote on them, the log of what you cooked |
| Your own words | ingredient names you added that we didn't recognise |
| Dietary settings | allergens, restrictions, ingredients you exclude |
| Account | your email address, and whatever your sign-in provider gives us |

**Things we record automatically:** ordinary technical logs — IP address,
browser and device type, pages requested, timestamps — kept for security,
debugging and abuse prevention. **We run no analytics.** There is no Google
Analytics, no pixel, no tag manager, and no third-party script of any kind on
this site — nothing here reports your behaviour to anyone else.

**Things we deliberately do not keep:** your location, your age, your gender,
your income, your household size, or any other demographic detail. We do not
ask, and there is nowhere to put it.

## 3. Using jipbap without an account

The pantry works before you sign up. When you first use jipbap we create a
record for you and store it against a token kept on your device.

Two things follow, and you should know both:

- **We cannot recover it.** If you clear your browser data before signing up,
  that pantry is gone. We know nothing about you that would let us find it
  again. This is why we ask you to sign up once you've added a few things.
- **It is never included in anything we share with other companies.** Sharing
  requires an account and your explicit permission (§5), and there is no way to
  give that permission before an account exists.

## 4. How we use it

To run jipbap: match recipes against what you have, rank by what needs using
first, apply your dietary settings, save your history, and keep your account
secure.

To improve jipbap: when enough different people use an ingredient name we don't
recognise, we add it to our ingredient list. That process counts how many people
used a word. It never records **which** people, and it never looks at your notes.

We do not use your data to train advertising profiles, and we do not run ads.

## 5. What we share with other companies

This is the section worth reading closely.

### 5.1 Our commitment

> We share only aggregate information — counts and totals about groups of
> people, from which individuals cannot be identified. We take active measures
> to prevent that information from being connected back to any person, we
> commit to maintaining it in that form, we will not attempt to re-identify it,
> and we contractually require everyone who receives it to do the same and to
> pass it to no one else.

**We do not sell personal information.** Where the law defines "sale" or
"sharing" of personal information — including under California law — we do not
do it, which is why you will not find a *Do Not Sell or Share My Personal
Information* link on this site. There is nothing behind it to switch off.

### 5.2 What is actually in it

Rows that look like this:

> *"1,240 people have doenjang in their pantry this month."*
> *"Demand for gochugaru rose 18% quarter over quarter."*
> *"860 people are one ingredient away from cooking kimchi jjigae; the missing
> item is usually pork belly."*

(Those are illustrations of the SHAPE, not real figures.)

Grocers and food companies buy this to decide what to stock and where they have
gaps. Every row covers at least **50** different people — rows below that
threshold are not produced at all, not rounded or blurred. That number is not a
statement of intent: it is a constant in the code that builds the figures
(`app/src/lib/pool.ts`), and a row that fails it is never constructed.

### 5.3 What is never in it

Never, at any group size, for any price:

- Your name, email, account ID, IP address, or device token
- Your pantry, your grocery list, or your cooking history as *yours*
- Anything you typed: notes, ingredient names you added, searches
- **Your dietary settings, restrictions and allergens** — these can reveal your
  health, your religion or your background, so they are excluded from shared
  data entirely, even in aggregate, even where it would be lawful to include
  them
- Anything organised by, or sliced by, characteristics like ethnicity,
  religion, or health

### 5.4 Your choice

Sharing is **off** unless you turn it on. We ask once, at sign-up, with the box
unticked:

> ▢ **Help shape what stores stock**
> We share counts — never your pantry, your name, or anything you wrote. Change
> this any time.

That wording is not a paraphrase. It is stored in the codebase as a single
constant (`app/src/lib/consent.ts`), hashed into every permission record, and
checked when figures are built — so a grant given against these words stops
counting the moment they change.

You can create an account, and use everything jipbap does, with that box left
alone. It is not a condition of anything.

To change your mind, use the same toggle in Settings. It takes effect on the
next set of figures we produce — nothing further about you is included. Figures
already delivered to a company cannot be recalled, which is why those contracts
require deletion within 12 months and forbid onward transfer.

## 6. Companies that work for us

Separately from §5, some companies handle data **on our behalf and under our
instructions** — hosting, databases, email delivery, error monitoring, sign-in.
They may only use it to provide that service to us.

Today that list is one entry long: **Google Cloud Platform** (United States),
which hosts the server. No database service, no email provider, no error
monitoring, no sign-in provider — because there are no accounts yet (§3), those
things have nothing to do.

## 7. Legal requests

We may disclose information where we are legally required to, to protect
someone's safety, or to enforce our terms. Where we are permitted to tell you
first, we will.

## 8. Your rights, wherever you live

We apply these to everyone, not only where they are legally required:

| | |
|---|---|
| **Take it with you** | Export everything private in a readable format, without telling us why |
| **Delete it** | We remove your private records outright |
| **Correct it** | Fix anything wrong |
| **Withdraw permission** | Turn off §5 sharing, as easily as you turned it on |

Export is a link on the page — it downloads everything held against your
device, verbatim, with nothing held back. For anything else, write to
**privacy@jipbap.com**. We answer within 45 days, and we never charge for it or
treat you differently for asking.

**One honest limit on deletion.** Our totals are rebuilt from whoever remains
rather than adjusted downward, so your contribution disappears when they are
next recomputed — but a figure already sent to a company before you deleted your
account cannot be pulled back out of it. It contains no personal information
about you, which is precisely why it cannot be located and removed.

## 9. If you are in the EU or UK

jipbap is offered to people in the United States. It is not directed at, marketed
in, or tailored for the EU or the UK, we have appointed no representative there,
and the recipes, the ingredient vocabulary and the one grocer we link to are all
US-facing.

We are not going to use that as a reason to treat you worse. If you reach this
site from the EU or the UK, everything in §8 applies to you in full, and so does
the rest of this policy. The controller is the operator identified in §1.

**Why we are allowed to hold your data:**

| What | Basis |
|---|---|
| Running your pantry and account | Performing our contract with you |
| Security, abuse prevention, debugging | Our legitimate interests |
| Improving our ingredient list from counts | Our legitimate interests |
| Sharing aggregates (§5) | **Your consent**, which you may withdraw at any time |

Your dietary settings may reveal special category data. We process them **only**
to filter what you see, on the basis of your explicit consent given when you
enter them, and they are never shared (§5.3).

You have the rights in §8 plus restriction, objection, and the right not to be
subject to solely automated decisions with legal effect — we make none. You may
complain to your local supervisory authority; we would rather you told us first.

Everything is stored on a single server in the United States, and nothing is
transferred anywhere else — there is no second region, no replica, and no
processor outside §6’s one entry.

## 10. If you are in California

You have the rights in §8, plus the right to know what we collect and to limit
our use of sensitive personal information. As stated in §5.1, **we do not sell
or share personal information**, so there is no opt-out to exercise and we
honour Global Privacy Control signals as a matter of course rather than
necessity. We will not discriminate against you for exercising any right.

Categories collected in the last 12 months, in the statute's terms:
identifiers, commercial information, internet activity, and — with your consent,
for filtering only — sensitive personal information in the form of health and
religious dietary data. Business purposes are in §4. Disclosures for a business
purpose are in §6.

## 11. Age

jipbap is not for children under 13, and we do not knowingly keep their data.
If you believe a child under 13 has an account, write to **privacy@jipbap.com**
and we will delete it. Because we do not sell or share personal information
(§5.1), no data about anyone under 16 is ever included in what we provide to
other companies.

## 12. Keeping it safe

HTTPS everywhere, so nothing travels in the clear. The device token that
addresses your pantry is set `httpOnly`, which means the page’s own JavaScript
cannot read it and neither can anyone else’s. Records are held on a single
server, and access is limited to the people who need it to operate the service.

**One limit stated plainly, because you should be able to weigh it:** records
are not encrypted at rest today. Where the law requires us to notify you of a
breach, we will — no system is perfectly secure and we will not pretend
otherwise.

## 13. How long we keep things

Your data stays until you delete it, or until the device token that addresses it
has gone unused for 24 months. Technical logs are kept 14 days. Records of the permissions you
gave — what you were shown and when you agreed — are kept after deletion with
your account identifier removed, because they are how we demonstrate the
sharing was permitted at the time.

## 14. Changes

We will post the new version here with a new effective date. **For any change
that widens what we share or what we share it for, the permission you gave under
§5.4 does not carry over — we will ask again, and the answer stays "no" until
you say otherwise.** For smaller changes we will tell you by email or in the app
before they take effect.

## 15. Contact

**privacy@jipbap.com**

We have appointed no data protection officer and are not required to: jipbap
carries out no large-scale monitoring and processes no special category data
beyond the dietary settings described in §9, which are never shared. A postal
address will be published here if we become obliged to have one.

---
