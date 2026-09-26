import { getTableName } from "drizzle-orm"
import { type PgTable } from "drizzle-orm/pg-core"
import { FAILPOINT_SCHEMA, testClient } from "./db"

let count = 0

const literal = (value: string | number) =>
  typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`

/**
 * A row trigger on `table` that runs `action` (PL/pgSQL) when `condition`
 * holds, only the first time with `once`. `resetDb` removes it.
 */
async function addFailpoint({
  table,
  when,
  condition = "TRUE",
  action,
  once = false,
}: {
  table: PgTable
  when: string
  condition?: string
  action: string
  once?: boolean
}) {
  const name = `${FAILPOINT_SCHEMA}.failpoint_${++count}`
  // A sequence, because nextval survives the rollback an exception causes
  const guarded = once
    ? `IF nextval('${name}_seq') = 1 THEN ${action} END IF;`
    : action
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE SEQUENCE ${name}_seq;
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF ${condition} THEN
        ${guarded}
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER failpoint_${count} ${when} ON "public"."${getTableName(table)}"
      FOR EACH ROW EXECUTE FUNCTION ${name}();
  `)
}

/**
 * Makes the next INSERT into `table` fail inside the database, as a driver
 * error would. With `where` (SQL column → value), only the next row that
 * matches fails. Later inserts go through.
 */
export async function failNextInsertInto(
  table: PgTable,
  where: Record<string, string | number> = {}
) {
  await addFailpoint({
    table,
    when: "BEFORE INSERT",
    condition:
      Object.entries(where)
        .map(([column, value]) => `NEW."${column}" = ${literal(value)}`)
        .join(" AND ") || "TRUE",
    action: `RAISE EXCEPTION 'failpoint: insert into % failed', TG_TABLE_NAME;`,
    once: true,
  })
}

/**
 * Runs `statement` (SQL) right after the next `event` on `table`, in its
 * transaction: the statements after it see what a concurrent writer that
 * committed just then would have written.
 */
export async function afterNextWriteTo(
  table: PgTable,
  event: "INSERT" | "UPDATE",
  statement: string
) {
  await addFailpoint({
    table,
    when: `AFTER ${event}`,
    action: `${statement};`,
    once: true,
  })
}

/**
 * Makes every INSERT and UPDATE statement on `table` last at least `ms`, after
 * its values are computed: the statements after it start later by the clock.
 * PGlite reads the JS clock, so it needs one that runs (no `vi.setSystemTime`).
 */
export async function slowWritesTo(table: PgTable, ms: number) {
  // A busy wait: PGlite's pg_sleep runs late
  await addFailpoint({
    table,
    when: "BEFORE INSERT OR UPDATE",
    action: `WHILE clock_timestamp() < statement_timestamp() + interval '${ms} milliseconds' LOOP END LOOP;`,
  })
}
