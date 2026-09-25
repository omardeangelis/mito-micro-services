import { getTableName } from "drizzle-orm"
import { type PgTable } from "drizzle-orm/pg-core"
import { FAILPOINT_SCHEMA, testClient } from "./db"

let count = 0

const literal = (value: string | number) =>
  typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`

/**
 * Makes the next INSERT into `table` fail inside the database, as a driver
 * error would. With `where` (SQL column → value), only the next row that
 * matches fails. Later inserts go through; `resetDb` removes the failpoint.
 */
export async function failNextInsertInto(
  table: PgTable,
  where: Record<string, string | number> = {}
) {
  const name = `${FAILPOINT_SCHEMA}.failpoint_${++count}`
  const condition =
    Object.entries(where)
      .map(([column, value]) => `NEW."${column}" = ${literal(value)}`)
      .join(" AND ") || "TRUE"

  // A sequence, because nextval survives the rollback the exception causes
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE SEQUENCE ${name}_seq;
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF ${condition} THEN
        IF nextval('${name}_seq') = 1 THEN
          RAISE EXCEPTION 'failpoint: insert into % failed', TG_TABLE_NAME;
        END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER failpoint_${count} BEFORE INSERT ON "public"."${getTableName(table)}"
      FOR EACH ROW EXECUTE FUNCTION ${name}();
  `)
}
