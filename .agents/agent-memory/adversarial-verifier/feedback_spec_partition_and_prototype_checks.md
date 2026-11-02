---
name: spec-partition-and-prototype-checks
description: Spec gates built from a prototype - test partition labels against every writer, run the prototype algorithm against property ACs, check twin-spec deletions of shared prototype files
metadata:
  type: feedback
---

When a spec defines a partition by one field (for example "no active contact") but gives the part a name about another field ("Senza operatore"):
- grep the services' docstrings for writers that produce the mixed combinations (customer with an operator and no active contact; active contact with no operator). In this repo `assignToYourself` and "Assegna Clienti" do it on purpose. A part name that does not match the field it is defined on, plus a write on that part, means the write touches a population the Non-Goals exclude.
- check who can hold items outside the population the UI lists (admins, null owner). Those items are counted, but no action can move them.

When a spec states property criteria for a split (sum, max difference, "no non-receiver below a receiver"), copy the prototype function into a 5-line `node -e` and run it on adjacent loads such as [2854, 2855] with count 2. The prototype may break the property, and the spec says nothing about the deviation.

After a spec rewrites a split property to "fix" the prototype, brute-force whether the property set is satisfiable at all (enumerate every integer split for loads 0..6, 2-3 people, Q 1..8). Round 2 of home-admin: "recipients' after-loads differ by at most 1" + "no chosen non-recipient has a load below a recipient's after" is impossible for [0,0] Q=1 or [0,5,5] Q=6.

Twin specs that both count "a user's contacts" (alerts, to-call): compare the sets. One used the "Solo i miei" set (own + colleague contacts whose customer is the user's), the other the contact's operator; a link from one page to the other then shows different numbers.

A "never called" definition based on a call log is blind to calls before the log started: check the log's start date in the domain contract and data conversions that move worked states (followup) into the "to call" state.

For a reason text shown "when not everyone receives", list every way a chosen person can get 0: rounding by largest remainder when Quanti is below the number chosen, ties. Then check that the text is true in each case.

Round 3: when the Decision Log says "the prototype breaks property X, don't port it", run the prototype function against the rewritten property over a grid. In home-admin the rewritten property was satisfied by the prototype everywhere, so the log entry was false. Also brute-force uniqueness: a satisfiable property set with many valid splits leaves copy like "Ricevono K dei N" undetermined.

When an OQ default narrows a definition used by a partition table (e.g. "not never-called if contacted before the log"), check every row of the table still covers the excluded case; otherwise the "parts sum to total" AC breaks.

Count the bullets under "in these N cases and only these": a stray list after an edit can make it N+1.

Twin specs: grep the twin's ACs for deleting its prototype folder, and grep this prototype for imports from it (`../home-operatore/shared`).

**Why:** home-admin gate 2026-11-01. All four checks found real defects that reading the spec text alone missed.
**How to apply:** any spec gate where a prototype is the source of copy and behaviour, or where Definitions split entities into parts.
