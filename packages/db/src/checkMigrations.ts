import fs from "fs"
import path from "path"

type Journal = { entries: { idx: number; when: number; tag: string }[] }
type Snapshot = { id: string; prevId: string }

const readJson = <T>(file: string) =>
  JSON.parse(fs.readFileSync(file, "utf8")) as T

/**
 * What is wrong with the migrations of `folder`, empty when nothing is. Two
 * branches that each generate a migration from the same schema, merged with
 * both entries kept in the journal, leave two snapshots with the same
 * `prevId`: the second migration was generated without the first, and the
 * migrator skips one whose date is older than the last one applied. The fix
 * is to delete the branch's migration and generate it again on top of the
 * base (`pnpm db:generate`).
 */
export function checkMigrations(folder: string): string[] {
  const { entries } = readJson<Journal>(path.join(folder, "meta/_journal.json"))
  const problems: string[] = []
  let previous: { tag: string; when: number; id: string } | undefined

  for (const [index, entry] of entries.entries()) {
    if (entry.idx !== index)
      problems.push(`${entry.tag}: idx ${entry.idx}, expected ${index}`)
    if (!fs.existsSync(path.join(folder, `${entry.tag}.sql`)))
      problems.push(`${entry.tag}: ${entry.tag}.sql is missing`)
    if (previous && entry.when <= previous.when)
      problems.push(
        `${entry.tag}: generated before ${previous.tag}, which comes first in the journal`
      )

    // With the "supabase" prefix the snapshot is named by the migration's timestamp
    const snapshotFile = path.join(
      folder,
      "meta",
      `${entry.tag.split("_")[0]}_snapshot.json`
    )
    if (!fs.existsSync(snapshotFile)) {
      problems.push(`${entry.tag}: its snapshot is missing`)
      previous = undefined
      continue
    }
    const snapshot = readJson<Snapshot>(snapshotFile)
    if (previous && snapshot.prevId !== previous.id)
      problems.push(`${entry.tag}: not generated on top of ${previous.tag}`)
    previous = { tag: entry.tag, when: entry.when, id: snapshot.id }
  }
  return problems
}
