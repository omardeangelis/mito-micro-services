import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import {
  type CustomerToPraticaWrite,
  type CustomerWrite,
  type PracticeWrite,
} from "@mito/domain/schemas"
import {
  CustomerMissing,
  type DbError,
  query,
  transaction,
} from "../../effect/db"
import { createCustomer } from "../customer/profile"
import { CustomerExists, PracticeExists } from "./errors"

/** The practice columns the "Nuova pratica" form writes. */
export type NewPracticeValues = Omit<
  PracticeWrite,
  "id" | "operatorId" | "fileName"
>

/** A customer the "Nuova pratica" form adds to the practice, with its role. */
export type RelatedCustomer = Omit<CustomerWrite, "operatorId" | "fileName"> & {
  id: string
  role: CustomerToPraticaWrite["customerRole"]
}

const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"

/**
 * Creates a practice from the "Nuova pratica" form, in one transaction: the
 * practice, the related customers (assigned to `operatorId`, the operator who
 * creates them) and the links of the holder and of the related customers.
 * Fails with `PracticeExists`, `CustomerExists` or `CustomerMissing` (the
 * holder doesn't exist), and then writes nothing.
 */
export const createPracticeWithCustomers = (input: {
  practice: NewPracticeValues
  holderId: string
  related: RelatedCustomer[]
  operatorId: number
}) =>
  transaction(
    Effect.gen(function* () {
      const { practice, holderId, related, operatorId } = input
      yield* query((client) =>
        client.insert(practices).values({ ...practice, fileName: "manual" })
      ).pipe(
        Effect.mapError((error) =>
          error.code === UNIQUE_VIOLATION ? new PracticeExists() : error
        )
      )
      for (const { role: _, ...customer } of related) {
        yield* createCustomer({
          ...customer,
          fileName: "manual",
          operatorId,
        }).pipe(
          Effect.mapError((error) =>
            error.code === UNIQUE_VIOLATION ? new CustomerExists() : error
          )
        )
      }
      const { praticaId } = practice
      const links: CustomerToPraticaWrite[] = [
        { customerId: holderId, customerRole: "Intestatario", praticaId },
        ...related.map((c) => ({
          customerId: c.id,
          customerRole: c.role,
          praticaId,
        })),
      ]
      yield* query((client) =>
        client.insert(customerToPratica).values(links)
      ).pipe(
        Effect.mapError((error): DbError | CustomerMissing =>
          // The related customers exist by now: only the holder can be missing
          error.code === FOREIGN_KEY_VIOLATION
            ? new CustomerMissing({ customerId: holderId })
            : error
        )
      )
      return { praticaId }
    })
  )

/**
 * Saves the practice's state from the dashboard and returns the updated rows'
 * ids (none if the practice doesn't exist).
 */
export const updatePracticeFromDashboard = (
  id: number,
  values: Pick<PracticeWrite, "state">
) =>
  query((client) =>
    client
      .update(practices)
      .set(values)
      .where(eq(practices.id, id))
      .returning({ id: practices.id })
  )
