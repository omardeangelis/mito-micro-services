---
name: sort-fixture-vacuity-and-runner-race
description: Sort/page tests that pass with the sort key swapped for the id (fixture order = id order), NULLS-LAST on desc unpinned, a JS-reference sweep that settles correctness, and a mutant runner started twice by nohup + run_in_background
metadata:
  type: feedback
---

Checks that worked on a paged list query with a computed sort key (subquery count), NULLs last and an id tie-break (63-test differential sweep + 37 mutants, ~10 min):

- **JS-reference sweep.** Seed ~40 rows with NULLs, ties (groups with equal updatedAt), equal operator names and mixed practice counts, then for every orderBy x {asc, desc, undefined} (plus removed/unknown names) compare the full list and the paged concatenation (perPage 7 -> 7,7,7,7,7,5,0) with a JS comparator (nulls last in both directions, id tie-break in the same direction, byte order because PGlite is C, enum order for pg enums). It proves the code correct in one run and kills every non-equivalent mutant; use it instead of reasoning.
- **Sort-key test whose fixture follows id order is vacuous.** A "orders by number of practices" test where the customers with more practices were created last passes with the key replaced by `customers.id` (the tie-break is the id). Mutate the key to `customers.id` and the column swaps (`name`->`surname`): they survive when the other columns are equal or ids and keys correlate. Ask for a fixture where key order and id order disagree.
- **NULLS LAST only shows on desc.** Postgres puts NULLs last on asc by default, so a test that checks the null row on asc cannot kill dropping the `IS NULL` key. The default factory fills name/surname, so nulls are absent unless the test makes them. Dropping the key survived 23/23; run it by hand.
- Equivalent mutant: `count(distinct x)` -> `count(x)` when the link table's PK is (customer_id, x).
- Two-row tie tests with sequential ids (customer-436/437) kill "no tie-break" only because insertion order is the opposite of the expected one; check the actual ids once (print them), a 99->100 boundary flips it.

**Runner race (harness).** I started `nohup python3 mut.py ... &` and, when its output file stayed empty, started the same runner again with `run_in_background`. The first one was alive: two runners rewrote one source file and the logs mixed (a mutant's log showed another mutant's failure message). Before any relaunch run `pgrep -f mut.py`; kill, `git checkout -- <file>` in the private worktree, delete the logs and run once. Also check a few kills' failure names against the mutant.

**Why:** the code under review was correct; the real findings were gaps in what the tests pin, which only mutants and a reference sweep show.

**How to apply:** for list queries, build the sweep first, then the mutants "drop NULL key", "key -> id", "swap similar column"; report survivors as test gaps with severity MINOR when the sweep shows the code right.

Related: [[feedback_list_query_mutant_patterns]], [[feedback_mutant_harness_hygiene]], [[feedback_mutant_battery_scratch_copy]]
