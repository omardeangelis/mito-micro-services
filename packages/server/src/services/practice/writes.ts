import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { query } from "../../effect/db"

/** The columns of a new practice row. */
export type NewPractice = typeof practices.$inferInsert

/** The columns of a new customer-practice link. */
export type NewCustomerToPractice = typeof customerToPratica.$inferInsert

/** The practice columns the dashboard writes. */
export type PracticeDashboardValues = Pick<NewPractice, "state" | "operatorId">

/** Inserts a practice and returns its `praticaId`, as `{ id }`. */
export const createPractice = (values: NewPractice) =>
  query((client) =>
    client
      .insert(practices)
      .values(values)
      .returning({ id: practices.praticaId })
  ).pipe(Effect.map((rows) => rows[0]))

/** Links a customer to a practice. */
export const linkCustomerToPractice = (values: NewCustomerToPractice) =>
  query((client) => client.insert(customerToPratica).values(values)).pipe(
    Effect.asVoid
  )

/**
 * Saves the practice's state and operator from the dashboard and returns the
 * updated rows' ids (none if the practice doesn't exist). `values` is passed
 * to `set` as is.
 */
export const updatePracticeFromDashboard = (
  id: number,
  values: PracticeDashboardValues
) =>
  query((client) =>
    client
      .update(practices)
      .set(values)
      .where(eq(practices.id, id))
      .returning({ id: practices.id })
  )

/** Sets the operator of the practices with the given `praticaId`s. */
export const assignPractices = (operatorId: number, praticaIds: string[]) =>
  query((client) =>
    client
      .update(practices)
      .set({ operatorId })
      .where(inArray(practices.praticaId, praticaIds))
  ).pipe(Effect.asVoid)
