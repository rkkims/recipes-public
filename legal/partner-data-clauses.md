# Partner data clauses

Contract terms binding any company that receives aggregate data from jipbap.

> **Draft for counsel review.** This is drafting input, not legal advice, and it
> is not a complete agreement — there is no term, fee, warranty, indemnity,
> liability cap, governing law or notice provision here. It is the data-handling
> schedule to sit inside whatever commercial agreement your lawyer papers.
>
> It exists because `PRIVACY-SPEC.md` §4 makes a public commitment that depends
> on a contract clause, and `legal/privacy-policy.md` §5.1 has already promised
> users that clause is in place. **Publishing the policy without these terms
> makes the policy false.**

Companions: `PRIVACY-SPEC.md` (§2 what may be disclosed, §4 the three
deidentification conditions), `legal/privacy-policy.md` §5.

---

## How this is meant to be used

Insert as **Schedule [X] — Data Terms**, referenced from the body of the licence
agreement, with §§1–4 and §12 of the body's definitions taking precedence on
anything commercial. The clause numbering below is self-contained so it can be
lifted whole.

Bracketed `[VALUES]` need filling. `⚑` marks a clause that is a **red line** —
see the negotiation guide in Part 2 for why, and for what may flex instead.

---

# Part 1 — The clauses

## 1. Definitions

**"Aggregate Data"** means the data files Provider makes available under this
Agreement, consisting of counts, rates, rankings and adjacency measures
describing groups of Provider's users, in which each row reflects no fewer than
[K] distinct individuals, and which contains no direct or indirect identifier of
any individual.

**"Other Data"** means any data, from any source, held by or available to
Recipient, including Recipient's own customer, loyalty, transaction, panel or
membership records and any data licensed from a third party.

**"Permitted Purpose"** means Recipient's internal assortment planning,
merchandising, category management, range review, demand forecasting and product
development. It does not include any purpose in clause 5.

**"Re-identify"** means to link, or attempt to link, any part of the Aggregate
Data to a specific individual or household, or to derive, or attempt to derive,
the identity, attributes or behaviour of any specific individual or household
from it — whether directly, by inference, by combination with Other Data, or by
any other means.

**"Personnel"** means Recipient's employees, officers, contractors, agents,
professional advisers and Affiliates who have access to the Aggregate Data.

## 2. Grant and scope

2.1 Provider grants Recipient a non-exclusive, non-transferable,
non-sublicensable licence to use the Aggregate Data solely for the Permitted
Purpose, for the term of this Agreement.

2.2 Recipient acquires no ownership of the Aggregate Data. All rights not
expressly granted are reserved.

2.3 Recipient shall limit access to Personnel with a need to access it for the
Permitted Purpose, and shall ensure each is bound by confidentiality obligations
no less protective than these terms. Recipient remains responsible for their
acts and omissions as if they were its own.

## 3. No re-identification ⚑

3.1 Recipient shall not Re-identify, and shall not permit or assist any person
to Re-identify, any part of the Aggregate Data.

3.2 Recipient shall not link, join, match, append, enrich or otherwise combine
the Aggregate Data with Other Data at any level of granularity finer than
[PERMITTED JOIN LEVEL — e.g. national, or category totals], whether or not the
purpose or effect is to Re-identify.

3.3 Recipient shall not attempt to derive, reconstruct or reverse-engineer
Provider's underlying records, individual user data, thresholds, suppression
rules or methodology from the Aggregate Data.

3.4 If Recipient Re-identifies any part of the Aggregate Data, or becomes aware
that Re-identification has occurred by any means including accident, Recipient
shall: (a) notify Provider without undue delay and in any event within [24/48]
hours; (b) cease all processing of the affected data; (c) not use, record,
disclose or act on any re-identified information; and (d) delete it and certify
that deletion under clause 7.3.

**Clause 3.2 is the operative one.** Aggregates are rarely broken open by
attacking them directly; they are broken by joining them to something else.

## 4. No onward transfer ⚑

4.1 Recipient shall not sell, licence, sublicense, rent, publish, distribute,
transfer or otherwise make the Aggregate Data available to any third party.

4.2 Clause 4.1 does not prevent disclosure to Personnel under clause 2.3, or to
a subcontractor processing on Recipient's behalf and for the Permitted Purpose
only, provided that Recipient first binds that subcontractor in writing to terms
at least as protective as clauses 3, 4, 5, 6 and 7, and remains fully liable for
its compliance.

4.3 Recipient shall not incorporate the Aggregate Data, in whole or in part,
into any product, dataset, index, benchmark, model or service made available to
any third party, whether or not for charge.

4.4 If compelled by law to disclose, Recipient shall, where legally permitted,
notify Provider in advance and disclose only the minimum required.

## 5. Prohibited uses ⚑

Recipient shall not use the Aggregate Data:

(a) to target, profile, score, contact or make any decision about any specific
individual or household;

(b) as a factor in any decision about eligibility for employment, credit,
insurance, housing, healthcare or any other benefit or service;

(c) to infer, segment by, or draw conclusions about any individual's or group's
race, ethnicity, national origin, religion, health, disability, sexual
orientation, immigration status or other protected characteristic;

(d) to train, fine-tune or evaluate any machine learning model whose outputs
concern specific individuals or households;

(e) in any manner that would require Provider to have obtained a consent,
provided a notice, or offered a right that Provider has not obtained, provided
or offered;

(f) in any manner inconsistent with Provider's published privacy policy at
[PRIVACY POLICY URL], as updated from time to time.

**On (c):** Provider's user base skews toward particular cuisines, and
ingredient demand therefore correlates with ethnic origin. Recipient is
prohibited from exploiting that correlation even where the Aggregate Data would
permit it, and Provider suppresses such cuts at source.

## 6. Security

6.1 Recipient shall protect the Aggregate Data with administrative, technical
and physical safeguards no less protective than those it applies to its own
confidential commercial data, and in any event including encryption in transit
and at rest, access control on a least-privilege basis, and logging of access.

6.2 Recipient shall notify Provider without undue delay, and in any event within
[72] hours, of any unauthorised access to, disclosure of, or loss of the
Aggregate Data.

## 7. Retention, deletion and certification ⚑

7.1 Recipient shall delete each delivered file, and all copies, within
[RETENTION PERIOD] of its delivery date, and shall in any event delete all
Aggregate Data within [30] days of expiry or termination of this Agreement.

7.2 Recipient may retain (a) analyses, conclusions and internal reports derived
from the Aggregate Data that contain no Aggregate Data rows, and (b) copies
retained in routine backups or required by law, which remain subject to these
terms for as long as retained.

7.3 On Provider's written request, and on termination, Recipient shall certify
deletion in writing signed by an authorised officer within [15] days.

**Deletion is the only control Provider has over data already delivered.**
`legal/privacy-policy.md` §8 tells users so in those words.

## 8. Compliance assurance

8.1 Recipient shall, on Provider's reasonable written request and no more than
[once] per twelve months, provide a written attestation from an authorised
officer confirming compliance with clauses 3, 4, 5 and 7, describing the
safeguards applied and identifying any subcontractor engaged under clause 4.2.

8.2 Where Provider has a reasonable, documented belief that clause 3 or 4 has
been breached, Provider may on [10] business days' notice require an audit by an
independent third-party auditor engaged at Provider's cost, subject to
confidentiality undertakings and conducted so as to minimise disruption.
Recipient shall bear the cost if the audit substantiates a breach.

## 9. Nature of the data and data-protection status

9.1 The parties acknowledge and intend that the Aggregate Data is aggregate,
de-identified information that does not identify and cannot reasonably be linked
to any individual, and that its disclosure is not a "sale" or "sharing" of
personal information under applicable law.

9.2 Accordingly the parties do not intend that any personal data is transferred,
and neither party acts as a processor of the other. **⚑ If, notwithstanding
clause 9.1, any Aggregate Data is determined to constitute personal data or
personal information, Recipient shall immediately notify Provider, cease
processing, and at Provider's election either delete it under clause 7 or
execute Provider's standard data processing agreement.** For the avoidance of
doubt, clauses 3 to 7 apply regardless of how the data is characterised.

9.3 Recipient shall not make any public statement characterising the Aggregate
Data as personal data, or the arrangement as a sale of personal information.

## 10. Attribution and publication

10.1 Recipient shall not publish, or disclose to any third party, any individual
Aggregate Data row.

10.2 Recipient may cite conclusions drawn from the Aggregate Data in materials
not made generally available to the public, attributed as [AGREED ATTRIBUTION
FORM]. Any public use requires Provider's prior written consent, not to be
unreasonably withheld.

10.3 Neither party may use the other's name, marks or logo, or state or imply
endorsement, without prior written consent.

## 11. No warranty as to accuracy

11.1 The Aggregate Data is directional signal derived from a self-selected user
population and is provided "as is". Provider does not warrant that it is
accurate, complete, representative of any market or population, or fit for any
particular purpose, and Recipient is solely responsible for decisions it takes
in reliance on it.

11.2 Provider may change its methodology, thresholds and suppression rules at
any time, including in ways that affect comparability between deliveries.

**11.1 is protective, not boilerplate.** Provider is selling what its own users
declare, not audited retail data, and a partner who treats it as census-grade
and then loses money will look at the contract first.

## 12. Remedies, termination and survival

12.1 Recipient acknowledges that breach of clause 3, 4 or 5 would cause Provider
harm not adequately compensable in damages, and that Provider is entitled to
seek injunctive relief without proving damage and without posting security, in
addition to all other remedies.

12.2 Provider may terminate this Agreement immediately on written notice for
breach of clause 3, 4, 5 or 7, and may suspend deliveries immediately on a
reasonable belief that such a breach has occurred or is threatened.

12.3 Clauses 3, 4, 5, 7, 9, 10, 11 and 12 survive expiry or termination.

---

# Part 2 — Negotiation guide

`PRIVACY-SPEC.md` §4 predicted the pressure point:

> Condition 3 is a term in the partner contract, so it is the one that will be
> negotiated away under commercial pressure. **It is not negotiable.** A partner
> who will not sign a no-reidentification clause is telling you what they intend
> to do with the file.

Concretely, here is where to hold and where to trade.

### Red lines — walking away is correct

| Clause | Why it cannot move |
|---|---|
| **3.1, 3.2** no re-identification, no joining | The public commitment in `PRIVACY-SPEC.md` §4.3 and the policy's §5.1 promise are *made of* this clause. Without it the deidentification carve-out fails and the disclosure becomes a sale of personal information — every claim already made to users turns false at once. |
| **4.1, 4.3** no onward transfer | The commitment binds "everyone who receives it". A file that can be passed on is a file with unbounded recipients, none of whom signed anything. |
| **5(b), 5(c)** no eligibility decisions, no protected-class inference | Cheap to give, catastrophic to omit. (c) is the specific exposure `PRIVACY-SPEC.md` §3 identifies for this product. |
| **7.1, 7.3** deletion and certification | Deletion is the only post-delivery control that exists, and users have been told it exists. |
| **9.2** reversion if characterised as personal data | The fallback that stops a regulatory recharacterisation from leaving the data ungoverned. |

**The tell to watch for:** a partner who accepts 3.1 readily but pushes hard on
3.2 is not confused about privacy. Joining your file to their loyalty data is
the use case they came for, and 3.2 is the clause that stops it.

### Where to flex instead

Give these to close the deal, in roughly this order:

1. **Audit scope (8.2)** → attestation only, or a longer notice period, or
   Provider always bears cost. The attestation in 8.1 is the part that matters;
   the audit right is mostly deterrent.
2. **Retention (7.1)** → a longer window. Twelve or eighteen months is still a
   clock. What matters is that one exists and that 7.3 makes it provable.
3. **Permitted Purpose (§1)** → widen the listed activities. Purpose breadth is
   far less dangerous than granularity, so long as clause 5 holds.
4. **Attribution (10.2)** → let them cite you publicly. This is a marketing
   concession, and often one you want.
5. **Join level (3.2)** → raise the permitted level of combination, but never to
   household, postcode, basket or member. Named geography is where this stops.
6. **Notification windows (3.4, 6.2)** → longer, if their security function
   genuinely cannot meet 24 hours.

### One structural alternative worth having in your pocket

If a partner's real need is joining to their own data, the answer is not to
weaken clause 3.2 — it is to change where the join happens. Run the analysis in
a clean room or on Provider's side and deliver only the result, so the partner
gets the answer without ever holding the file. That preserves every clause here
and turns a red-line fight into a scoping conversation. It is more engineering
than a file drop, and it should be priced accordingly.

---

# Part 3 — What still has to be settled

| # | Item | Where it is blocked |
|---|---|---|
| 1 | **`[K]`** — appears in clause 1 and in `legal/privacy-policy.md` §5.2 | `PRIVACY-SPEC.md` §8 open question 1. Publishing it in the policy makes it a promise; putting it in the contract makes it a warranty. Set it once, high. |
| 2 | **`[PERMITTED JOIN LEVEL]`** in 3.2 | Needs a default before the first negotiation, or it gets set by whoever asks first. Suggest: national and category-level only. |
| 3 | **`[RETENTION PERIOD]`** in 7.1 | `PRIVACY-SPEC.md` §8 open question 4, and quoted to users in `legal/privacy-policy.md` §5.4. The policy and the contract must carry the same number. |
| 4 | **Delivery-zone dimension** | If ever built (`PRIVACY-SPEC.md` §8 open question 3), clause 3.2's join level and clause 1's per-row `[K]` both need revisiting — `k` must then hold *per bucket*, and a sparse bucket is a name. |
| 5 | **Liability cap interaction** | Breach of clause 3 or 4 should sit outside the general cap, or 12.1's injunctive remedy is doing all the work alone. A drafting point for counsel, flagged because it is usually missed. |
