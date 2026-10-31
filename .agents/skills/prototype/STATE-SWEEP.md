# The State Sweep

An optional, recommended step of Phase 6, between reducing the surface to the winner and the reviews. It makes the winner **state-complete** before anyone judges it: it lists every state the real feature can be in, builds the missing ones on the prototype surface, captures each one, and shows the user the whole catalogue for approval. Only then do `ux-advisor` and `ui-reviewer` run, on a winner whose states the user has already seen and approved.

Without it, the winner reaches the reviews with the states its fake state machine happens to know, usually the happy path. The reviewers then report the missing states as decisions, and the spec carries them as open work for `implement-spec`, the most expensive place to design an error state. The sweep moves that design work to the prototype, where it is cheap and the user can see it.

Adapted from the MIT-licensed `ui-sweep` skill (`ref-tools/marketplace`, `plugins/ref-skills/skills/ui-sweep`): its state inventory, its capture rules and its catalogue. Its Ref integration, sandbox and fix PRs are not used here.

## When to offer it

Right after Phase 6 step 1 (the surface reduced to the winner), ask once, with your tool's structured question mechanism when it has one. **Recommend the sweep** when any of these holds for the winner:

- it calls an operation that changes data or waits on the system;
- it shows data that can be empty, very long, numerous, or fail to load;
- what it shows depends on a role, a permission or a plan;
- it has more than one step, or an overlay that opens over another;
- people will use it at phone width.

When none holds (a static piece with one state), recommend skipping, and say why in one line. The options:

- **Run the state sweep** (recommended, when it is): the steps below, then the reviews.
- **Skip: review the winner as it is**: Phase 6 step 3, as without the sweep.

`keep <variant>, sweep` and `keep <variant>, no sweep` answer the question up front. Never run the sweep without the user's yes, and never skip it without asking unless the invocation said so.

## What it leaves next to the winner

- **`STATES.md`**: the inventory, the decisions taken on the built states, the user's answers, and the approval line (template below).
- **`states/`**: the screenshots, named `<id>-<width>.png` (`<id>-<width>-dark.png` for the dark theme). They are working evidence: never commit them.
- **`STATES.html`**: the report the user reviews at the state gate, generated from `STATES.md` and `states/` (Step 4). Never edit it by hand and never commit it: regenerate it.
- **The state switch** in the harness: `?state=<id>` opens the winner in that state.

All four are deleted with the prototype surface (Hard Rule 5). Before that, `create-spec` carries the state matrix into the spec folder.

## Step 1 — Inventory, from the code

List every state the real feature can show, not only the ones the winner shows. Sources, in this order:

- the Phase 1 scope and the winner's own code: its harness, fixtures and strings;
- the real system the feature will call: the domain contract under `brain/domains/<domain>/`, the API client and its error mapping, the backend handlers when they are in the repo, the permission checks, the data model's limits;
- the closest shipped flow that calls the same operation.

A code line is the evidence that a state exists. For each action or region, cover:

- **healthy**, and its variants: one item, many items, the longest realistic values the data model allows, at the limit;
- **empty**: first use, filtered to nothing, cleared;
- **loading** and **slow** (much longer than the prototype's fake delay);
- **every outcome of every operation**: success, partial success, uncertain (a timeout after the request left), each error the client tells apart (validation, conflict, not found or gone, no permission, session expired, rate limit, quota or cap reached, already done);
- **role and permission views** (viewer, teammate, signed out) when the surface depends on them;
- **offline**;
- **each step** of a multi-step flow, and each overlay open.

Every row also names the **widths** it needs: by default the desktop width (1440 px) and a phone width (390 px), plus the minimum width of the Project bar in `brain/chore/ui-review.md` when the project set one. Add the **dark theme** when the project ships one. Do not multiply every row by every axis: a state that only changes text needs one width.

Every row also carries a **description**: one to three short sentences, in the user's language, for someone who has not read the code. Say when the person reaches the state, what they see, and what they can do next. The trigger and the source line are the evidence; the description is what the user reads at the gate.

Each row reads `present` (the winner already shows it), `to build`, or `real only` (it needs the real backend, a device or real data the prototype cannot fake; say what). Merge rows that share one answer. More than about 30 rows means the scope is wider than one piece: say so and offer to split it, the way Phase 1 narrows a brief.

**Needs you.** When the code proves a state exists but nothing says what the person should see (does a conflict name the teammate? does the quota error offer an upgrade?), that is a product call, not yours. List it with a recommended pick and the reason.

## Step 2 — Confirm the list

Show the user the inventory table and the Needs you calls, before building anything. This is the cheap stop: a state dropped here costs nothing to build. Ask once:

- **Build the list as it is** (recommended);
- **Adjust it**: drop a state, add one, or mark one `real only`;
- **Answer the Needs you calls** first, when the user wants another pick than yours.

Apply the answer to `STATES.md`, then build. An unanswered Needs you call takes its recommended pick, and the gate in step 5 shows it as taken.

## Step 3 — Build the missing states

- **The prototype surface only** (Hard Rule 1). Never production code.
- **The winner's direction.** New states use the winner's tokens, layout, components and motion line, and the project's component library. A state that needs a new direction is a Needs you call, not something you build.
- **Realistic content.** The longest real names and numbers; the copy from the real error mapping when the code has it, otherwise copy you write, recorded as a decision. Every state that ends a task leaves the person a next step (retry, fix, check, leave).
- **The state switch.** The harness reads `?state=<id>` (the standalone file the same way, from `location.search`) and seeds the fake state machine and fixtures into that state. No parameter opens the winner's default state. From any seeded state the interactions still work: Retry after an error does what it would do. The switch has no visual chrome: the catalogue lists the URLs.
- **Motion.** A state that enters or leaves (an error appearing, a row removed) follows the winner's motion line and the `design-engineering` standards. Record any new motion values as decisions.
- **Record every decision** a built state takes, with its exact values (copy, layout, component, motion), under `STATES.md` → Decisions, and set its row from `to build` to `built`.

## Step 4 — Capture

Use `agent-browser` on a session of its own (`--session sweep-<slug>`, never the default one). Before the first command, run `agent-browser skills get core` and follow it: it is the usage guide for the installed version.

For every `present` and built row, at each of its widths and themes:

1. open `<route>?state=<id>`, set the viewport, and wait until the page is idle;
2. take the screenshot into `states/<id>-<width>[-dark].png`;
3. **open the screenshot** and check that it shows the intended state: not a blank page, not an error you did not mean, not the default state because the switch did not apply, not a frame caught mid-transition. Fix the harness or retake it;
4. read the console: it stays clean in every state.

Flip each state that animates once with `prefers-reduced-motion: reduce` emulated: nothing travels, and the meaning survives. Close the session at the end.

Then **generate the report**:

```bash
node <skillsDir>/prototype/scripts/state-report.mjs <winner-dir> --base <origin> [--lang en|it]
```

`<winner-dir>` holds `STATES.md` and `states/`; `--base` is the origin the winner runs on (`http://localhost:5173`), so the report's links open the prototype and each live state from wherever the report is opened; `--lang` sets the language of the report's own labels (default `en`). It writes `STATES.html` next to `STATES.md` and prints its path. The report opens with a link to the prototype in its default state and a legend of its labels: **Prototype** (a `present` row: reachable by interacting with the prototype), **Alternative state** (a `built` row: not reachable by using the prototype, it appears only when certain conditions occur), **Real system only**, `approved`, Decision taken and Needs you. Each label also explains itself on hover and keyboard focus. Then it shows the states one under the other, grouped by action or region: each with its description, its screenshots at full width (desktop and phone at the same height), its live link, the decision taken on it and its Needs you call, with the trigger and source folded under "Where it comes from". Open the report yourself and check that every image loads before you show it.

Regenerate it after every change to `STATES.md` or `states/`: at the gate, and at the approval gate after the reviews.

**Without browser tooling**, take no screenshots: the report shows each state's live link in place of its screenshots and opens with `DEGRADED — no screenshots`, and the gate asks the user to open each URL themself.

## Step 5 — The state gate

The user approves the catalogue **before any reviewer is briefed**. The reviewers judge the states; the user decides that these are the right states, designed the right way. In one message, show:

- **the report first**: the URL of `STATES.html` (served by the dev server when it serves files from the project, otherwise its `file://` path), which carries every state below; open it in the tool's browser when it has one;
- where the winner runs, and the URL of each state;
- the catalogue, grouped by action or region: each state with its screenshots and its description;
- the decisions taken on the built states, with their exact values;
- the Needs you calls, with the pick taken;
- the `real only` rows and why: they go to the spec as criteria or open questions.

Then **stop and wait**, with your tool's structured question mechanism when it has one:

- **Approve** → write `approved: yes` with the date in `STATES.md`, then Phase 6 step 3 (the reviews), with `STATES.md` in both briefs.
- **Adjust a state** → apply the change under the step 3 rules, retake its screenshots, regenerate the report, and show the gate again.
- **Add a state** → add its row, build it, capture it, regenerate the report, and show the gate again.
- **Drop a state** → remove it from the surface. Its row stays in `STATES.md` under Dropped, with the user's reason: the spec lists it under Non-Goals.

If the user stops before answering, leave `approved: no`: `create-spec` shows the gate before it writes anything.

The reviews can still change the winner. Those changes go through the iterate loop and the approval gate as before, and the approval gate retakes the screenshots of every state a change touches and updates its row. The state gate does not open again.

## `STATES.md` template

```markdown
# State sweep: <piece>

Winner: `<variant>` at `<route>` · <date>
approved: no

## States
| id | Action or region | State | Description | Real trigger | Source | In the prototype | Widths | Open | Screenshots |
|---|---|---|---|---|---|---|---|---|---|
| S1 | Archive | success | The project leaves the list and a toast offers Undo for a few seconds. | `POST /projects/:id/archive` → 200 | `api/projects.ts:30` | present | 1440, 390 | `?state=S1` | `states/S1-1440.png`, `states/S1-390.png` |
| S4 | Archive | conflict: a teammate archived it first | Someone else archived the project a moment earlier. The row says who and when, and nothing is lost: the project is already in Archived. | → 409 `ConflictError` | `api/projects.ts:41` | built | 1440, 390 | `?state=S4` | `states/S4-1440.png`, `states/S4-390.png` |
| S9 | Archive | session expired mid-request | The session ran out while archiving; the person lands on sign-in. | → 401, redirect to sign-in | `api/client.ts:88` | real only: needs the real auth flow | — | — | — |

## Decisions
- **S4**: the row shows "Mara archived this project 2 minutes ago" in `--text-muted`, the project moves to Archived, no error styling, no retry.

## Needs you
| # | Question | Pick | Taken by |
|---|---|---|---|
| 1 | Does the conflict name the teammate? | Yes: the person knows nothing was lost | user, step 2 |

## Real only
- **S9** session expired mid-request: needs the real auth flow → the spec decides what survives the redirect.

## Dropped
- **S12** bulk archive at the cap: <the user's reason>
```

`approved: no` becomes `approved: yes (YYYY-MM-DD)` at the state gate.

## The brief for the reviewers

When the sweep ran, add to both briefs in Phase 6 step 3:

- the path of `STATES.md`, approved by the user;
- how to open each state: `<route>?state=<id>`.

`ux-advisor` starts its outcome catalogue from `STATES.md` instead of rebuilding it, checks it against the code, and reports a state the sweep missed as a finding. `ui-reviewer` takes the `STATES.md` rows as its list of states. Neither changes `STATES.md`: it is the user's approved catalogue.
