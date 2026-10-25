import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { query } from "../../effect/db"

/** The columns of a new customer row. */
export type NewCustomer = typeof customers.$inferInsert

/** The customer columns the master-data form writes. */
export type CustomerProfileValues = Partial<NewCustomer>

/** The blacklist status column of a customer. */
export type BlackListStatus = NewCustomer["blackListStatus"]

/** Inserts a customer and returns its id. */
export const createCustomer = (values: NewCustomer) =>
  query((client) =>
    client.insert(customers).values(values).returning({ id: customers.id })
  )

/**
 * Saves the customer's master data and returns its id. `values` is passed to
 * `set` as is. The operator changes only through `handover` (D13): the caller
 * leaves `operatorId` out.
 */
export const updateCustomerProfile = (
  id: string,
  values: CustomerProfileValues
) =>
  query((client) =>
    client
      .update(customers)
      .set(values)
      .where(eq(customers.id, id))
      .returning({ id: customers.id })
  )

/** Saves the customer's email and phone number. */
export const updateCustomerContacts = (
  id: string,
  values: Pick<NewCustomer, "email" | "phoneNumber">
) =>
  query((client) =>
    client.update(customers).set(values).where(eq(customers.id, id))
  ).pipe(Effect.asVoid)

/** Sets the customer's blacklist status. */
export const setBlackListStatus = (
  id: string,
  status: NonNullable<BlackListStatus>
) =>
  query((client) =>
    client
      .update(customers)
      .set({ blackListStatus: status })
      .where(eq(customers.id, id))
  ).pipe(Effect.asVoid)

/** Marks the customer as just modified (sets its `updatedAt`). */
export const markCustomerUpdated = (id: string) =>
  query((client) =>
    client
      .update(customers)
      .set({ updatedAt: new Date() })
      .where(eq(customers.id, id))
  ).pipe(Effect.asVoid)
