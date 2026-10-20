import type postgres from "postgres"

/** The schemas a copy of the database carries (`pg_dump --schema`). */
const COPIED_SCHEMAS = ["public", "drizzle"]

/**
 * What a copy of the database must keep: every table of `COPIED_SCHEMAS` with
 * its row count and a checksum of its rows, the sequences, and the schema
 * (columns, indexes, constraints, enums, database settings). Rows are compared
 * as text, so the session settings that change their text are fixed
 * (`fingerprint`).
 */
export type Fingerprint = {
  tables: Record<string, { rows: number; checksum: string }>
  sequences: Record<string, string | null>
  schema: Record<string, unknown[]>
}

// Ordered with COLLATE "C": the default collations of two servers may differ
const SCHEMA_QUERIES = {
  columns: `SELECT table_schema, table_name, column_name, data_type, udt_name,
      is_nullable, column_default
    FROM information_schema.columns WHERE table_schema IN ('public', 'drizzle')
    ORDER BY table_schema COLLATE "C", table_name COLLATE "C", column_name COLLATE "C"`,
  indexes: `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname IN ('public', 'drizzle')
    ORDER BY schemaname COLLATE "C", tablename COLLATE "C", indexname COLLATE "C"`,
  constraints: `SELECT n.nspname AS schema_name, conrelid::regclass::text AS table_name,
      conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname IN ('public', 'drizzle')
    ORDER BY n.nspname COLLATE "C", conrelid::regclass::text COLLATE "C", conname COLLATE "C"`,
  // `ALTER DATABASE ... SET`, which a dump of the schemas leaves out: on
  // Supabase the database sets TimeZone, which the app's dates depend on
  settings: `SELECT setting FROM (
      SELECT unnest(setconfig) AS setting FROM pg_db_role_setting
      WHERE setrole = 0
        AND setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    ) s ORDER BY setting COLLATE "C"`,
  enums: `SELECT t.typname, e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typnamespace = 'public'::regnamespace
    ORDER BY t.typname COLLATE "C", e.enumsortorder`,
}

/**
 * Reads the fingerprint of the database of `client` in one read-only
 * transaction, so a database in use gives a consistent one. Only
 * transaction-scoped settings (`SET LOCAL`): through a transaction pooler a
 * session `SET` would stay on a backend the app uses.
 */
export async function fingerprint(client: postgres.Sql): Promise<Fingerprint> {
  return client.begin(
    "isolation level repeatable read read only",
    async (sql) => {
      // The text of timestamps, dates, intervals, floats and bytes
      await sql`SET LOCAL TimeZone = 'UTC'`
      await sql`SET LOCAL DateStyle = 'ISO, YMD'`
      await sql`SET LOCAL IntervalStyle = 'postgres'`
      await sql`SET LOCAL extra_float_digits = 1`
      await sql`SET LOCAL bytea_output = 'hex'`

      const tables: Fingerprint["tables"] = {}
      const names = await sql<{ schema: string; name: string }[]>`
        SELECT n.nspname AS schema, c.relname AS name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND n.nspname IN ${sql(COPIED_SCHEMAS)}
        ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"`
      for (const { schema, name } of names) {
        // A checksum of the sorted row hashes: the same rows give the same
        // value whatever their order on disk
        const [row] = await sql<{ rows: number; checksum: string }[]>`
          SELECT count(*)::int AS rows,
            md5(coalesce(string_agg(h, '' ORDER BY h COLLATE "C"), '')) AS checksum
          FROM (SELECT md5(t::text) AS h FROM ${sql(schema)}.${sql(name)} t) s`
        tables[`${schema}.${name}`] = row!
      }

      const sequences: Fingerprint["sequences"] = {}
      for (const row of await sql<{ name: string; value: string | null }[]>`
        SELECT schemaname || '.' || sequencename AS name, last_value::text AS value
        FROM pg_sequences WHERE schemaname IN ${sql(COPIED_SCHEMAS)}`) {
        sequences[row.name] = row.value
      }

      const schema: Fingerprint["schema"] = {}
      for (const [part, query] of Object.entries(SCHEMA_QUERIES)) {
        schema[part] = [...(await sql.unsafe(query))]
      }
      return { tables, sequences, schema }
    }
  )
}

/**
 * The differences between the fingerprints of the source and of its copy, one
 * line each: none when the copy is identical.
 */
export function compareFingerprints(source: Fingerprint, copy: Fingerprint) {
  const differences: string[] = []
  const keys = (a: object, b: object) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()

  for (const table of keys(source.tables, copy.tables)) {
    const a = source.tables[table]
    const b = copy.tables[table]
    if (!a) differences.push(`${table}: only in the copy`)
    else if (!b) differences.push(`${table}: missing in the copy`)
    else if (a.rows !== b.rows)
      differences.push(`${table}: ${a.rows} rows, ${b.rows} in the copy`)
    else if (a.checksum !== b.checksum)
      differences.push(`${table}: same ${a.rows} rows, different values`)
  }
  for (const sequence of keys(source.sequences, copy.sequences)) {
    const a = source.sequences[sequence]
    const b = copy.sequences[sequence]
    if (a !== b) {
      differences.push(
        `sequence ${sequence}: ${a ?? "unused"}, ${b ?? "unused"} in the copy`
      )
    }
  }
  for (const part of keys(source.schema, copy.schema)) {
    const a = source.schema[part] ?? []
    const b = copy.schema[part] ?? []
    const length = Math.max(a.length, b.length)
    for (let i = 0; i < length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        differences.push(
          `schema ${part}: ${JSON.stringify(a[i] ?? null)} in the source, ${JSON.stringify(b[i] ?? null)} in the copy`
        )
        break
      }
    }
  }
  return differences
}
