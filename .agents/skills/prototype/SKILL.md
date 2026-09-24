---
name: prototype
description: Build multiple genuinely different versions of a UI piece you describe, rendered behind a visual picker so you can flip through them live and promote the one that feels right. Only runs when explicitly invoked; it does not trigger on its own.
disable-model-invocation: true
---

# Prototyping Variants

A divergence skill. It does ONE thing: take a described piece of UI ("a toast", "the pricing card", "a hold-to-delete button"), build several genuinely different versions of it, and put them behind a visual picker so the user can flip through them live and choose a winner. It does not review existing UI, plan fixes for it, or choose dependencies — those are the `design-engineer` agent's modes (review, audit, library pick).

## Contract

- **Role:** UI divergence explorer — builds N genuinely different variants of one described piece behind a visual picker
- **Entrypoint type:** public entrypoint, **explicit invocation only** (`disable-model-invocation: true`) — never auto-triggered by a routing table. Other skills and agents may *suggest* a run; only the user invokes it.
- **Upstream:** the user describing a UI piece to explore; open visual/interaction questions surfaced during `create-spec` / `create-plan` (the flow suggests a run, the user invokes it)
- **Delegates to:** nothing — single-thread by design; consults the project's design knowledge during recon (root `AGENTS.md`, `brain/chore/`, and any design skill the project ships — see "In a brain project"), and may brief the **`design-engineer`** agent for a motion opinion on the variants before presenting them
- **Downstream:** `create-spec` — the winner is never integrated by hand: its direction and exact values (easing, durations, layout, states, copy) enter `SPEC.md` / `FLOW.md` / `PLAN.md`, and production code is written by `implement-spec` under the project's own coding standards
- **Precedence:** consumer of the project's design corpora — brand/identity rules win on color and typography, motion standards (the `design-engineer` agent or a project `design-engineering` skill) win on anything motion, layout/aesthetic direction comes from the project's frontend-design guidance when it exists. Divergence never lowers their bars.

## Operating Posture

You are a senior design engineer running a design exploration. The entire value of this skill is **divergence**: three tints of the same idea waste the picker — the user learns nothing by flipping between them. Each variant must be a direction you could defend shipping on its own, exploring a genuinely different answer to the same brief.

Divergence is not an excuse to drop the craft bar. Every variant individually meets the motion standards — right easing (`ease-out` on entrances, never `ease-in`), sub-300ms UI motion, correct `transform-origin`, `transform`/`opacity` only, reduced-motion handled. A sloppy variant doesn't widen the exploration; it just loses on execution and teaches nothing about the direction it represents.

## Hard Rules

1. **Never touch production code.** Everything lives in an isolated prototype surface (see Phase 4) — during exploration *and* after the choice. Phase 6 hands the winner to the implementation flow; it does not integrate it.
2. **Variants diverge on a named axis** — layout, density, personality, motion, interaction model. Before building, you must be able to state each variant's axis in a phrase. Sharing the project's tokens is not convergence; variants *should* feel native to the product.
3. **Every variant fully works.** Real interactions, real motion, realistic content — actual product-shaped copy, plausible names and numbers. No lorem ipsum, no dead buttons, no "imagine this part".
4. **The picker is chrome, not a contestant.** Its exact markup, styles, and behavior are specified in [PICKER.md](PICKER.md) — copy them verbatim. Its look is not a design decision and never adapts to the project.
5. **Clean up after the choice.** When a winner is promoted, delete the prototype surface unless the user asks to keep it — at the latest when the real implementation lands (see Phase 6).

## Workflow

### Phase 1 — Scope

One thing per run. If the description spans multiple components ("the dashboard"), narrow it: pick the single highest-leverage piece, say which and why, and offer the rest as follow-up runs. Restate the brief in one sentence — what the thing is, where it will live, what it must do.

**Where it lives is not yours to guess.** A brief that names the piece but not the screen ("the recent-searches list", a contract, a spec) can fit several routes, and a variant built against the wrong surrounding context teaches nothing. If the user has not given the route (or page/file for the standalone branch), find the candidate screens during Phase 2 recon, then **ask for confirmation of the route before Phase 3** — name each candidate with its path and one line on why it fits, and recommend one. Use your tool's structured question mechanism when it has one (in Claude Code, `AskUserQuestion` with the candidate routes as options, the recommended one first). Do not start building on a guess. Skip the question only when the brief names the route or the piece exists on exactly one screen.

### Phase 2 — Recon

Before designing anything, map the ground the variants must stand on:

- **Stack**: framework, styling system (Tailwind, CSS modules, vanilla), motion library if any.
- **Tokens**: colors, radii, spacing, fonts, easing/duration variables. Variants use these — every variant should look like it could ship in this product tomorrow.
- **Personality**: playful consumer app or crisp dashboard? This bounds how far the boldest variant may go.
- **Context**: where the piece renders — against what background, beside what neighbors, at what sizes.

If there is no project (empty directory, or the user is just exploring), skip to the standalone branch in Phase 4 and choose a restrained default look: neutral grays, one accent, system font stack.

### Phase 3 — Choose directions

Default **3 variants**; up to 5 when the user asks or the design space is genuinely wide. More than 5 dilutes the comparison.

Before writing any code, list the set: a name and an axis for each. Names describe the direction — "Quiet", "Editorial", "Playful", "Dense" — never "Option A/B/C". If two proposed directions would differ only in accent color or copy, they are one direction; replace one with a real alternative (different layout, different interaction model, different motion story).

**Completion criterion:** every variant has a name and a stated axis, and no two variants share an axis position.

### Phase 4 — Build the picker harness

Two branches, by what exists:

- **In a project with a dev server** — an isolated route or page (`/prototypes/<slug>`, or the framework's equivalent), one file per variant plus a small harness file. Nothing imports from the prototype surface into production code.
- **No project / static context** — a single self-contained HTML file (inline CSS/JS) the user can open directly in a browser.

The picker's markup, styles, keyboard wiring, and placement come from [PICKER.md](PICKER.md), verbatim — load it now and build exactly that. Beyond the picker itself, the harness must render **one variant at a time, full size, in realistic surrounding context** — a toast needs a page behind it, a card needs siblings, a button needs a form. Side-by-side thumbnails distort spacing and scale; never judge UI at postage-stamp size. Switching is **instant** — flipping is a 100+/session action; by the frequency rule the variant swap gets no animation.

### Phase 5 — Verify and hand off

Run the harness. Confirm every variant renders, every interaction responds, and the console is clean — flip through all of them yourself before showing the user. If browser tooling is available (`$agent-browser` or the tool's own browser), screenshot each variant.

Then present the set and **stop — the choice belongs to the user**:

| # | Variant | Axis | When it's the right choice | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Quiet | Minimal motion, borders over shadows | The product is a daily-use tool | Least memorable |
| 2 | Editorial | Large type, generous whitespace | The moment deserves weight | Eats vertical space |

Close with where the picker is running (URL or file path) and the keys to flip.

**Completion criterion:** every variant is reachable from the picker and behaves correctly; no console errors; the table names each variant's tradeoff honestly.

### Phase 6 — Hand the winner to the implementation flow

A chosen variant is an **answer to a design question**, not a feature ready to ship: it runs on a fake state machine, invented copy, and no backend contract. Writing it straight into production code skips every gate the project has — spec, plan, review.

So, when the user picks, do exactly two things:

1. **Reduce the surface to the winner.** Delete the losing variants and the picker (with one variant left it has nothing to switch between); keep the winning variant reachable at its prototype route. It stays the live reference the spec points at.
2. **Enter the project's implementation flow with `create-spec`.** The prototype is the *input* to that flow: carry over its direction and its exact values — easing, durations, layout, states, copy — as spec decisions, and note what the prototype faked (endpoints, permissions, real data, error paths) as the open questions the spec must answer. The prototype surface gets deleted per Hard Rule 5 only when the real implementation lands.

Never write production code directly from Phase 6, even when the variant looks finished. If the user explicitly asks for a direct integration anyway, say what the spec flow would have caught, then do it.

If the user instead wants another round, keep the harness and run Phase 3 again, diverging *around* the direction they gravitated to.

## In a brain project

How the phases above bind to the brain / spec-driven workflow. Everything else is stack-agnostic and identical to the upstream skill (`omardeangelis/design-eng-skills`, `skills/prototype/`); the brain-specific parts are Hard Rule 1, the route-confirmation paragraph in Phase 1, Phase 6, and this section — re-apply them when syncing the upstream.

- **Recon (Phase 2) reads the project, not assumptions.** Start from the root `AGENTS.md` (stack, styling system, design-system or component-library pointer, motion library) and `brain/chore/` (tech stack, product description — this is where the product's personality is usually written down). If the project ships design skills — a `design-engineering` / motion skill, brand guidelines, a frontend-design skill — load them: they are the craft bar every variant must meet. If it ships none, the **`design-engineer`** agent carries a baseline of exact motion values; brief it with the variant set before Phase 5 when motion is part of the exploration.
- **Route confirmation (Phase 1):** find candidate routes in the project's router (read `AGENTS.md` for where routes live); present them as options with path + one line each, the recommended one first.
- **In-project branch (Phase 4):** keep the prototype surface in a single folder (e.g. `src/prototypes/<slug>/` — one file per variant plus the harness), exposed as a **dev-only** route (`/prototypes/<slug>`) guarded by the framework's dev flag so it never ships. Put the surface where the project's styling pipeline can see it (a Tailwind `@source` allowlist, a CSS-modules root, …) — markup outside that scope renders **silently unstyled**. Load the project's coding-standards skill before writing framework code, but never let the prototype leak into production imports.
- **Standalone branch (Phase 4):** if `brain/chore/` contains an HTML prototyping kit (a starter file with the real tokens), duplicate it; otherwise write the single self-contained HTML file. Right choice for purely visual/motion pieces; pick the in-project branch when the piece needs the real component library's behavior.
- **Picker in a framework** (per PICKER.md's "idiomatic" clause): a current-variant state + keyed re-mount so switching re-runs entrance animations; refs + a layout effect for the highlight measurement. Classes and values stay verbatim.
- **Promotion (Phase 6) opens the brain flow, not a direct integration:** `create-spec` → `create-plan` → `implement-spec` → `adversarial-review` → `docs-maintenance`. The `SPEC.md` cites the prototype by path and route and inherits its exact values as decisions; `create-plan` turns those values into task targets (`review_mode: browser`); only `implement-spec` writes production code, in the location the project's architecture dictates. The prototype folder and its route are deleted once the implementation lands (Hard Rule 5) — `implement-spec` does that as part of finalizing the spec folder.

## Invocation Variants

| Invocation | Behavior |
| --- | --- |
| `<description>` | Full workflow: scope → recon → 3 variants → picker → wait for choice |
| `<description> x5` | Same, with that many variants (capped at 5) |
| `riff <variant>` | New round: keep the harness, generate a fresh set diverging around the named variant's direction |
| `keep <variant>` | Reduce the surface to that variant, then open `create-spec` with it as input (Phase 6) |
| `keep <variant>, leave the picker` | Same, but leave the losing variants and the picker in place |

## Tone

Sell each variant honestly — one line on when it wins, one on what it costs. Never pre-pick a favorite in the table; if the user asks which you'd choose, answer with a reason rooted in the product's personality and frequency of use, not aesthetics alone. If two variants converged while you built them, cut one and say so: a picker with two truly distinct directions beats one padded to three.
