import { describe, expect, it } from "vitest"
import { pendingMigrations, pendingSummary } from "../pendingMigrations"

const journal = (...tags: string[]) => ({
  entries: tags.map((tag) => ({ tag })),
})
const sqlOf = (tag: string) => `-- ${tag}\nSELECT 1;`

describe("pendingMigrations", () => {
  it("finds nothing when staging runs the same migrations", () => {
    const both = journal("0001_a", "0002_b")

    expect(pendingMigrations(both, both, sqlOf)).toStrictEqual([])
  })

  it("finds the migration the deploy adds, with its SQL", () => {
    expect(
      pendingMigrations(
        journal("0001_a", "0002_b"),
        journal("0001_a", "0002_b", "0003_c"),
        sqlOf
      )
    ).toStrictEqual([{ tag: "0003_c", sql: "-- 0003_c\nSELECT 1;" }])
  })

  it("keeps the journal's order when the deploy adds several", () => {
    const pending = pendingMigrations(
      journal("0001_a"),
      journal("0001_a", "0002_b", "0003_c"),
      sqlOf
    )

    expect(pending.map(({ tag }) => tag)).toStrictEqual(["0002_b", "0003_c"])
  })

  it("counts every migration when staging's commit is unknown", () => {
    const pending = pendingMigrations(
      undefined,
      journal("0001_a", "0002_b"),
      sqlOf
    )

    expect(pending.map(({ tag }) => tag)).toStrictEqual(["0001_a", "0002_b"])
  })
})

describe("pendingSummary", () => {
  it("shows each migration's SQL to the person who approves", () => {
    const summary = pendingSummary(
      [{ tag: "0003_c", sql: "ALTER TABLE t ADD COLUMN c int;\n" }],
      "fcfdcfe45c2921a5831e76d20dad7dbce74e340a"
    )

    expect(summary).toContain("## Migrazioni da approvare: 1")
    expect(summary).toContain("`fcfdcfe`")
    expect(summary).toContain(
      "### 0003_c\n\n```sql\nALTER TABLE t ADD COLUMN c int;\n```"
    )
  })

  it("says nothing waits when there is no migration", () => {
    expect(pendingSummary([], "fcfdcfe")).toContain("Nessuna migrazione nuova")
  })
})
