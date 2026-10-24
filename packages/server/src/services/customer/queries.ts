import { eq, inArray, countDistinct, or, sql } from "drizzle-orm"
import { Effect } from "effect"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { operators } from "@mito/db/schema/operators"
import { query } from "../../effect/db"

/** The codes that identify a customer; `findCustomersByCode` reads them. */
export type CustomerCodes = {
  fiscalCode?: string
  vatCode?: string
  tempID?: string
}

/** The customer with this id, or `undefined` if there is none. */
export const getCustomerById = (id: string) =>
  query((client) =>
    client.select().from(customers).where(eq(customers.id, id))
  ).pipe(Effect.map((customer) => customer[0]))

/**
 * The customers that match any of the codes passed. Empty codes match nobody,
 * so without a code the list is empty.
 */
export const findCustomersByCode = (input: CustomerCodes) =>
  query((client) =>
    client
      .select()
      .from(customers)
      .where(
        or(
          input.tempID ? eq(customers.tempID, input.tempID) : undefined,
          input.fiscalCode
            ? eq(customers.fiscalCode, input.fiscalCode)
            : undefined,
          input.vatCode ? eq(customers.vatCode, input.vatCode) : undefined
        ) ?? sql`false`
      )
  )

/** The practices a customer signed, each with the customer's role in it. */
export const listPracticesOfCustomer = (customerId: string) =>
  Effect.gen(function* () {
    const praticaIDs = yield* query((client) =>
      client
        .select({
          id: customerToPratica.praticaId,
          customerRole: customerToPratica.customerRole,
        })
        .from(customerToPratica)
        .where(eq(customerToPratica.customerId, customerId))
    )

    if (praticaIDs.length === 0) {
      return []
    }

    const pratiche = yield* query((client) =>
      client
        .select({
          id: practices.id,
          praticaId: practices.praticaId,
          productId: practices.productId,
          state: practices.state,
          dataLiquidazione: practices.dataLiquidazione,
        })
        .from(practices)
        .where(
          inArray(
            practices.praticaId,
            praticaIDs.map((p) => p.id)
          )
        )
    )

    return pratiche.map((p) => ({
      ...p,
      customerRole: praticaIDs.find((pp) => pp.id === p.praticaId)!
        .customerRole,
    }))
  })

/** The customers of a practice, each with the operator and the role in it. */
export const listCustomersOfPractice = (praticaId: string) =>
  Effect.gen(function* () {
    const customersIDs = yield* query((client) =>
      client
        .select({
          id: customerToPratica.customerId,
          customerRole: customerToPratica.customerRole,
        })
        .from(customerToPratica)
        .where(eq(customerToPratica.praticaId, praticaId))
    )

    if (customersIDs.length === 0) {
      return []
    }

    const praticaCustomers = yield* query((client) =>
      client
        .select({
          id: customers.id,
          name: customers.name,
          surname: customers.surname,
          email: customers.email,
          fiscalCode: customers.fiscalCode,
          vatCode: customers.vatCode,
          phoneNumber: customers.phoneNumber,
          blackListStatus: customers.blackListStatus,
          operatorId: customers.operatorId,
          operatorName: operators.name,
          operatorSurname: operators.surname,
        })
        .from(customers)
        .leftJoin(operators, eq(customers.operatorId, operators.id))
        .where(
          inArray(
            customers.id,
            customersIDs.map((c) => c.id)
          )
        )
    )

    return praticaCustomers.map((c) => ({
      ...c,
      customerRole: customersIDs.find((cc) => cc.id === c.id)!.customerRole,
    }))
  })

/**
 * The customers in review or blacklisted, with their operator and the number
 * of practices they signed, oldest update first and, on the same date, by id.
 */
export const listCustomersUnderReview = () =>
  query((client) =>
    client
      .select({
        id: customers.id,
        name: customers.name,
        surname: customers.surname,
        fiscalCode: customers.fiscalCode,
        vatCode: customers.vatCode,
        birthdayDate: customers.birthdayDate,
        blackListStatus: customers.blackListStatus,
        operatore: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
        signedPractices: countDistinct(customerToPratica.praticaId),
      })
      .from(customers)
      .where(
        or(
          eq(customers.blackListStatus, "review"),
          eq(customers.blackListStatus, "blacklisted")
        )
      )
      .leftJoin(
        customerToPratica,
        eq(customers.id, customerToPratica.customerId)
      )
      .leftJoin(operators, eq(customers.operatorId, operators.id))
      .groupBy(customers.id, operators.id)
      .orderBy(customers.updatedAt, customers.id)
  )
