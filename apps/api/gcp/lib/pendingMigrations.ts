export type Journal = { entries: { tag: string }[] }

export type PendingMigration = { tag: string; sql: string }

/**
 * The migrations a deploy brings to staging: those in the journal of the
 * commit being deployed and not in the journal of the commit staging runs.
 * Without the latter (no deploy recorded yet, or a commit the history no
 * longer has) every migration counts: the approval sees them all, and the
 * migrator applies only the ones the database lacks.
 */
export function pendingMigrations(
  deployed: Journal | undefined,
  current: Journal,
  readSql: (tag: string) => string
): PendingMigration[] {
  const known = new Set(deployed?.entries.map(({ tag }) => tag) ?? [])
  return current.entries
    .filter(({ tag }) => !known.has(tag))
    .map(({ tag }) => ({ tag, sql: readSql(tag) }))
}

/** The summary of the run, for the person who approves. */
export function pendingSummary(
  pending: PendingMigration[],
  deployedSha: string
) {
  const base = deployedSha
    ? `rispetto al commit su staging \`${deployedSha.slice(0, 7)}\``
    : "nessun deploy registrato su staging: tutte le migrazioni del repo"
  if (pending.length === 0)
    return `## Migrazioni\n\nNessuna migrazione nuova (${base}): nessuna approvazione, nessun backup.\n`
  return [
    `## Migrazioni da approvare: ${pending.length}`,
    "",
    `Confronto ${base}. Dopo l'approvazione: backup di Cloud SQL, poi le migrazioni, poi il deploy.`,
    "",
    ...pending.flatMap(({ tag, sql }) => [
      `### ${tag}`,
      "",
      "```sql",
      sql.trim(),
      "```",
      "",
    ]),
  ].join("\n")
}
