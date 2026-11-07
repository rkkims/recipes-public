# Privacy Policy

**jipbap** · Effective 18 August 2026

## The short version

jipbap keeps what you tell it about your kitchen, on its own server, and shows it
to nobody. An account is optional and asks for an id, not for your name. There
are no analytics, no trackers, and no third parties receiving anything about you.

## What we keep

- **Your kitchen**: ingredients you have, what's on your grocery list, what you
  marked *use first*.
- **Your cooking**: recipes you saved, what you cooked and when, ratings and
  notes you wrote.
- **Your dietary settings**: allergens and restrictions you set, used only to
  filter what you are shown.
- **Your account, if you make one**: an id you choose and your password, which
  we store only as a scrypt hash and never in a form we can read. An email
  address is optional, off by default, and kept for one purpose: getting you
  back into your account if you lose the password. We do not send anything else
  to it, there are no newsletters, and it is never given to anyone. Leave it
  empty and there is nothing to lose but the way back in.
- **How the app is used**: which recipes and shopping links were shown, which
  were tapped, and when your pantry changed and why. We keep this to find out
  what works and what is broken. It records what happened, never who you are:
  there is no name or email in it, and there is nothing about you in it that you
  did not do here.
- **Ordinary server logs**: IP address, browser type, pages requested,
  timestamps. Kept 14 days, for security and debugging.

We do not ask for your name, your location, your age, or anything else about
you, and there is nowhere to put it.

## How it is stored

You can use jipbap without an account, and most people start that way. When you
first use jipbap we create a record and address it with a token kept in your
browser, set `httpOnly` so no page's JavaScript can read it. While that is all
there is, two things follow:

- **Clearing your browser data loses it**, and we cannot get it back. We know
  nothing else about you that would let us find it.
- **Anyone using that browser can see it.** Treat it like a note on the fridge.

Making an account fixes the first of those and only that: your kitchen is then
addressed by your account, so it survives a cleared browser and follows you to a
second device. It is an id and a password, not an identity. We do not ask for
your name, and an email address is yours to give or withhold.

Records live on one server in the United States. They are not encrypted at rest.

## What we do not do

- **No third-party analytics.** No Google Analytics, no pixel, no tag manager,
  no third-party script of any kind. What we measure about how the app is used,
  we measure ourselves, on our own server, and it goes nowhere else.
- **No selling or sharing your information.** Not to anyone, not for any price.
  There is no advertising here and no data business behind it.
- **No profiles.** Nothing you do here is used to target you anywhere else.

## Affiliate links

Some links to a grocer earn us a commission if you buy something. They are
marked wherever they appear. Following one takes you to that grocer's site,
where their privacy policy applies, not ours.

The link carries a reference for that single tap, so that if a purchase follows
we are paid for it. The reference belongs to the tap and not to you: it is newly
made each time, it is not the token in your browser, and it cannot be used to
recognise you on a second visit. We send them nothing else, and they tell us
nothing about you in return beyond whether a purchase happened.

## Creators

This section is only about creator pages. If you do not have one, nothing here
applies to you.

**A creator page is public, and that is its whole purpose.** The display name,
one-line bio, picture, channel links and affiliate tag on it are published for
everyone to read. Some pages exist before anyone claims them, built from
recipes we found published on the open web; if one is about you and you want it
gone, write to **hello@jipbap.com** and it goes, without our asking why. A
claimed page can also be withdrawn at any time from the page itself, which
hides it from everyone but you.

**Your kitchen stays out of it.** Claiming a page joins it to your account, not
to your pantry. What you have, what is on your list, what you cooked and what
you wrote about it are as private for a creator as for anyone else, and nothing
on the public page is drawn from them.

**Proving a page is yours.** Today the proof is something you publish and we
read: we give you a token, and you put it in your site's homepage meta tag, in
a file at `/jipbap-claim.txt`, or in a `_jipbap-claim` DNS record. Our server
then fetches those addresses and makes that DNS lookup. It is an ordinary
request to a public address, the same one any visitor makes. We keep which
channel was proved and the date it passed.

**Signing in with a platform, when it exists.** Verifying a YouTube, Instagram
or TikTok channel properly needs that platform's OAuth, which is planned and
not yet built. When it arrives it will work this way, and if that ever has to
change, this page changes before it does:

- We ask the platform for the narrowest permission that answers one question:
  do you control this channel.
- We keep the channel's id and the date it was verified. That is the record.
- We never receive or store your password for that platform: you sign in with
  them, not with us.
- We do not read your messages, your private analytics or your follower list,
  we do not post anything as you, and we do not import your content unless you
  ask us to on the page where you ask.
- Disconnecting is yours to do, at the platform and here. Doing it leaves the
  page unverified; it does not delete the page or anything you put on it.

## Your data is yours

- **Take it**: the export link gives you everything held against your browser,
  verbatim, in one file.
- **Delete it**: if you have an account, **Account → Close your account** deletes
  your login, your recovery address if you gave one, and everything in your
  kitchen immediately, and unpicks your name
  from the usage record in the same move. We keep no copy of your kitchen. What
  survives is counting: that a pantry somewhere gained an onion on a Tuesday,
  with nothing left in it that points back at you. Without an account, clearing
  your browser's cookies for this site removes the link to your data.
- **Ask us anything**: write to **hello@jipbap.com** and we will answer.

## Children

jipbap is not for children under 13 and we do not knowingly keep their data.

## Changes

We will post a new version here with a new effective date. If a change affects
what we keep or who sees it, we will say so in the app rather than quietly
editing this page.

## Contact

**hello@jipbap.com**
