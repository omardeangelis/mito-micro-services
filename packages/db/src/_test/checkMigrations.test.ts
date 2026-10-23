import fs from "fs"
import os from "os"
import path from "path"
import { describe, expect, it } from "vitest"
import { checkMigrations } from "../checkMigrations"

const FOLDER = path.resolve(__dirname, "../../migrations")

type Entry = { idx: number; version: string; when: number; tag: string }

/** A copy of the repo migrations, with `change` applied to its journal. */
function copyWith(change: (entries: Entry[], copy: string) => Entry[]) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"))
  fs.cpSync(FOLDER, copy, { recursive: true })
  const file = path.join(copy, "meta/_journal.json")
  const journal = JSON.parse(fs.readFileSync(file, "utf8")) as {
    entries: Entry[]
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ ...journal, entries: change(journal.entries, copy) })
  )
  return copy
}

/** A migration generated from the schema of `base`, as a branch does. */
function addMigration(
  copy: string,
  entries: Entry[],
  { base, when, name }: { base: Entry; when: number; name: string }
) {
  const timestamp = String(20990101000000 + entries.length)
  const tag = `${timestamp}_${name}`
  const baseSnapshot = JSON.parse(
    fs.readFileSync(
      path.join(copy, "meta", `${base.tag.split("_")[0]}_snapshot.json`),
      "utf8"
    )
  ) as { id: string }
  fs.writeFileSync(path.join(copy, `${tag}.sql`), "SELECT 1;")
  fs.writeFileSync(
    path.join(copy, "meta", `${timestamp}_snapshot.json`),
    JSON.stringify({ id: `${name}-id`, prevId: baseSnapshot.id })
  )
  return [
    ...entries,
    { idx: entries.length, version: "7", when, tag } satisfies Entry,
  ]
}

describe("checkMigrations", () => {
  it("finds nothing wrong with the repo migrations", () => {
    expect(checkMigrations(FOLDER)).toStrictEqual([])
  })

  it("accepts a migration generated on top of the last one", () => {
    const copy = copyWith((entries, copy) => {
      const last = entries.at(-1)!
      return addMigration(copy, entries, {
        base: last,
        when: last.when + 1,
        name: "next",
      })
    })

    expect(checkMigrations(copy)).toStrictEqual([])
  })

  it("reports two migrations generated from the same schema", () => {
    const copy = copyWith((entries, copy) => {
      const last = entries.at(-1)!
      const ours = addMigration(copy, entries, {
        base: last,
        when: last.when + 2,
        name: "ours",
      })
      return addMigration(copy, ours, {
        base: last,
        when: last.when + 1,
        name: "theirs",
      })
    })

    expect(checkMigrations(copy)).toStrictEqual([
      expect.stringMatching(/_theirs: generated before .*_ours/),
      expect.stringMatching(/_theirs: not generated on top of .*_ours/),
    ])
  })

  it("reports a journal entry without its SQL", () => {
    const copy = copyWith((entries) => entries)
    const last = JSON.parse(
      fs.readFileSync(path.join(copy, "meta/_journal.json"), "utf8")
    ).entries.at(-1) as Entry
    fs.rmSync(path.join(copy, `${last.tag}.sql`))

    expect(checkMigrations(copy)).toStrictEqual([
      `${last.tag}: ${last.tag}.sql is missing`,
    ])
  })
})
