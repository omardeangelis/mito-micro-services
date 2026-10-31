import type { Column } from "drizzle-orm"
import { sql } from "drizzle-orm"

export function castAsNumber(col: Column) {
  return sql<number>`cast(${col} as numeric)`
}

/**
 * The Rome calendar day of a timestamp column, as `YYYY-MM-DD`: the day the
 * instant falls on in Europe/Rome, whatever the time zone of the session.
 */
export function romeDayOf(column: Column) {
  return sql<string>`to_char(${column} AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD')`
}

/**
 * Pattern di `ilike` che cerca `q` come testo: `%`, `_` e `\` scritti
 * dall'utente non fanno da caratteri jolly (`\` è l'escape di default di LIKE)
 */
export function containsPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`
}
