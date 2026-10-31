# brain Bookkeeping

Use this reference after writing `SPEC.md`.

## Required updates

1. Add a row to the **Specs** table in `brain/index.md`:

```md
| <domain> | [[specs/<domain>/<folder-name>/SPEC]] | Draft |
```

2. Add an entry to `brain/specs/<domain>/<domain>-specs.md` with:
   - the spec name
   - a one-line summary

3. Append to `brain/log.md`:

```md
## [YYYY-MM-DD] spec | <spec title>
- Created spec: [[specs/<domain>/<folder-name>/SPEC]]
- Flow: [[specs/<domain>/<folder-name>/FLOW]]   <!-- include only if a FLOW.md map was written from a ux-advisor review -->
- States: [[specs/<domain>/<folder-name>/STATES]]   <!-- include only if a STATES.md matrix was written from an approved state sweep -->
- Domain: <domain>
- Status: Draft
```

4. For each feature-improvement entry the spec took up (discovery step 7), set its **Status** to `planned` and its **Spec** line to `[[specs/<domain>/<folder-name>/SPEC]]`, and bump the page's `updated`.

5. When the questions surfaced an improvement to an existing feature that the spec leaves out (a Non-Goal, a rejected review finding that is not a defect), propose recording it per `brain/AGENTS.md` → Relationship to the feature-improvement store. Write only the ones the user accepts.

Do not skip this step.
