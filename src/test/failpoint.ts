import { onTestFinished, vi } from "vitest"
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
 * matches fails; with `sqlstate`, it fails with that code (else P0001). Later
 * inserts go through.
 */
export async function failNextInsertInto(
  table: PgTable,
  where: Record<string, string | number> = {},
  { sqlstate }: { sqlstate?: string } = {}
) {
  const errcode = sqlstate ? ` USING ERRCODE = ${literal(sqlstate)}` : ""
  await addFailpoint({
    table,
    when: "BEFORE INSERT",
    condition:
      Object.entries(where)
        .map(([column, value]) => `NEW."${column}" = ${literal(value)}`)
        .join(" AND ") || "TRUE",
    action: `RAISE EXCEPTION 'failpoint: insert into % failed', TG_TABLE_NAME${errcode};`,
    once: true,
  })
}

/**
 * Makes the next UPDATE of a row of `table` fail inside the database, as a
 * driver error would. With `where` (SQL column → value), only the next row that
 * matches fails. Later updates go through.
 */
export async function failNextUpdateOf(
  table: PgTable,
  where: Record<string, string | number> = {}
) {
  await addFailpoint({
    table,
    when: "BEFORE UPDATE",
    condition:
      Object.entries(where)
        .map(([column, value]) => `NEW."${column}" = ${literal(value)}`)
        .join(" AND ") || "TRUE",
    action: `RAISE EXCEPTION 'failpoint: update of % failed', TG_TABLE_NAME;`,
    once: true,
  })
}

/**
 * Makes the COMMIT of any transaction that writes `table` fail: a deferred
 * constraint trigger raises when the transaction ends, not at the statement
 * that wrote, so the statements pass and only the COMMIT is rejected. Every
 * such commit fails, until `resetDb` removes the trigger.
 */
export async function failAtCommit(table: PgTable) {
  const name = `${FAILPOINT_SCHEMA}.failpoint_${++count}`
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'failpoint: commit of % failed', TG_TABLE_NAME;
    END $$;
    CREATE CONSTRAINT TRIGGER failpoint_${count}
      AFTER INSERT OR UPDATE OR DELETE ON "public"."${getTableName(table)}"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ${name}();
  `)
}

/**
 * Counts the `event` statements on `table` from now on, rows or not: the
 * returned function reads the count. `resetDb` removes the counter.
 */
export async function countStatementsOn(
  table: PgTable,
  event: "INSERT" | "UPDATE"
) {
  const name = `${FAILPOINT_SCHEMA}.statements_${++count}`
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE SEQUENCE ${name}_seq;
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM nextval('${name}_seq');
      RETURN NULL;
    END $$;
    CREATE TRIGGER statements_${count} AFTER ${event} ON "public"."${getTableName(table)}"
      FOR EACH STATEMENT EXECUTE FUNCTION ${name}();
  `)
  return async () => {
    const { rows } = await testClient.query<{ n: number }>(
      `SELECT CASE WHEN is_called THEN last_value ELSE 0 END::int AS n FROM ${name}_seq`
    )
    return rows[0]!.n
  }
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

/**
 * Runs `statement` (SQL) right before the next `SELECT … FOR UPDATE` of `table`
 * (the lock `lockCustomer` takes), in its transaction: the lock and the
 * statements after it find the rows a colleague would have written while the
 * transaction waited for the lock, and the statements before it don't. It
 * tests what the code does with those rows. Being in the same transaction,
 * they are found under any isolation level: that the transactions run in
 * `read committed` is checked in `db.db.test.ts`. If the transaction fails,
 * `statement` rolls back with it. Row locks fire no trigger, so it wraps the
 * transactions of `testClient` instead, until it runs or the test ends. A test
 * where it never runs fails: the lock was not taken, or not the way it expects.
 */
export function beforeNextLockOf(table: PgTable, statement: string) {
  const lock = new RegExp(`from "${getTableName(table)}" .*for update$`)
  const transaction = testClient.transaction.bind(testClient)
  let done = false
  const spy = vi
    .spyOn(testClient, "transaction")
    .mockImplementation((callback) =>
      transaction((tx) => {
        const query = tx.query.bind(tx)
        tx.query = (async (sql: string, ...rest: unknown[]) => {
          if (!done && lock.test(sql)) {
            done = true
            spy.mockRestore()
            await tx.exec(statement)
          }
          return query(sql, ...(rest as []))
        }) as typeof tx.query
        return callback(tx)
      })
    )
  onTestFinished(() => {
    spy.mockRestore()
    if (!done) {
      throw new Error(`No SELECT … FOR UPDATE of ${getTableName(table)} ran`)
    }
  })
}
