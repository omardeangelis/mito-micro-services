import "server-only"
import { or, sql } from "drizzle-orm"
import { type AnyPgColumn } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { type LookupKeys } from "@mito/domain/import/payload"
import { type CrmCustomer, type CrmState } from "@mito/domain/import/plan"
import { query } from "../../effect/db"

/**
 * `column` is one of `values`, passed as one array parameter: a file has up to
 * `MAX_ROWS` keys of a kind, more than a list of parameters takes.
 */
const anyOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} = ANY(${sql.param(values)}::text[])`

const customersWith = (codes: {
  fiscalCodes: readonly string[]
  vatCodes: readonly string[]
  customerCodes: readonly string[]
}) =>
  codes.fiscalCodes.length + codes.vatCodes.length + codes.customerCodes.length
    ? query((client) =>
        client
          .select({
            id: customers.id,
            fiscalCode: customers.fiscalCode,
            vatCode: customers.vatCode,
            tempID: customers.tempID,
          })
          .from(customers)
          .where(
            or(
              anyOf(customers.fiscalCode, codes.fiscalCodes),
              anyOf(customers.vatCode, codes.vatCodes),
              anyOf(customers.tempID, codes.customerCodes)
            )
          )
      )
    : Effect.succeed([] as CrmCustomer[])

/** By `id`, in the order of its characters (`COLLATE "C"`) on every side. */
const byId = (a: CrmCustomer, b: CrmCustomer) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * What the CRM has for the keys of a file (`import.lookup`, D3), for
 * `planRows`. Reads only.
 *
 * - The customers with a fiscal code, VAT number or customer code of the file,
 *   and those with the VAT number of the ones a row can recognize: today's
 *   rule updates them too (D11). The fiscal code of one a row recognizes is
 *   a key of the file already.
 * - The practices of the file that exist, and their links.
 */
export const lookupExisting = (keys: LookupKeys) =>
  Effect.gen(function* () {
    const found = yield* customersWith(keys)

    // The ones `recognize` of `planRows` can pick
    const fiscalCodes = new Set(keys.fiscalCodes)
    const vatCodes = new Set(keys.vatCodes)
    const moreVatCodes = [
      ...new Set(
        found
          .filter((customer) =>
            customer.fiscalCode
              ? fiscalCodes.has(customer.fiscalCode)
              : !!customer.vatCode && vatCodes.has(customer.vatCode)
          )
          .map((customer) => customer.vatCode)
          .filter((code): code is string => !!code && !vatCodes.has(code))
      ),
    ]
    const more = yield* customersWith({
      fiscalCodes: [],
      vatCodes: moreVatCodes,
      customerCodes: [],
    })

    const praticaIds = keys.praticaIds.length
      ? (yield* query((client) =>
          client
            .select({ praticaId: practices.praticaId })
            .from(practices)
            .where(anyOf(practices.praticaId, keys.praticaIds))
        )).map(({ praticaId }) => praticaId)
      : []
    const links = praticaIds.length
      ? yield* query((client) =>
          client
            .select({
              customerId: customerToPratica.customerId,
              praticaId: customerToPratica.praticaId,
            })
            .from(customerToPratica)
            .where(anyOf(customerToPratica.praticaId, praticaIds))
        )
      : []

    const unique = new Map(
      [...found, ...more].map((customer) => [customer.id, customer])
    )
    return {
      customers: [...unique.values()].sort(byId),
      praticaIds,
      links,
    } satisfies CrmState
  })
