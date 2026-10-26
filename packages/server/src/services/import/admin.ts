import { sql } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"

/**
 * How the import names an admin (AC22, AC28): the name and surname of their
 * operator row, otherwise the name of the user, otherwise the email. For a
 * query that joins `users` and, with a left join, `operators`.
 */
export const adminName = sql<string>`COALESCE(
  NULLIF(TRIM(CONCAT_WS(' ', ${operators.name}, ${operators.surname})), ''),
  NULLIF(TRIM(${users.name}), ''),
  ${users.email}
)`

const romeTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
})

/** The time of `date` in Rome, as "10:05". */
export const timeInRome = (date: Date) => romeTime.format(date)
