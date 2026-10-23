import path from "path"
import { fileURLToPath } from "url"
import { checkMigrations } from "../src/checkMigrations"

// `pnpm db:check`, run by the CI: fails when two migrations were generated
// from the same schema, as when two branches each add one
const folder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations"
)
const problems = checkMigrations(folder)

if (problems.length === 0) {
  console.log("Migrations OK")
} else {
  console.error(
    [
      "Migrations to fix:",
      ...problems.map((problem) => `- ${problem}`),
      "",
      "Delete this branch's migrations (.sql, snapshot and journal entry), merge the base branch, then run `pnpm db:generate`.",
    ].join("\n")
  )
  process.exitCode = 1
}
