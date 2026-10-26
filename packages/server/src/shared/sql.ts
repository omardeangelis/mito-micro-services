import type { Column } from "drizzle-orm"
import { sql } from "drizzle-orm"

export function castAsNumber(col: Column) {
  return sql<number>`cast(${col} as numeric)`
}

/**
 * Pattern di `ilike` che cerca `q` come testo: `%`, `_` e `\` scritti
 * dall'utente non fanno da caratteri jolly (`\` è l'escape di default di LIKE)
 */
export function containsPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`
}
