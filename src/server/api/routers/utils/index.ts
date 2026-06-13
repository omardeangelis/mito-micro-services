import type { Column } from "drizzle-orm"
import { sql } from "drizzle-orm"

/**
 *
 * @param col Drizzle column
 * @returns lower case of the column
 * @example const result = await db.select({
  id: users.id,
  lowerName: lower(users.name),
}).from(users);
 */
export function lower(col: Column) {
  return sql<string>`lower(${col})`
}

export function upper(col: Column) {
  return sql<string>`upper(${col})`
}

export function castAsNumber(col: Column) {
  return sql<number>`cast(${col} as numeric)`
}
