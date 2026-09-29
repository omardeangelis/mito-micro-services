import { customers } from "../db/schema/customers"
import { eq, or } from "drizzle-orm"
import { type PgUpdateSetSource } from "drizzle-orm/pg-core"
import { type SupaBaseDb } from "@/lib/types"
import { type CustomerWrite } from "@/lib/types/schemas"

type UpdateImportedCustomerParams = {
  db: SupaBaseDb
  /** The imported row's identifiers; empty ones match nothing */
  identifiers: Pick<CustomerWrite, "tempID" | "fiscalCode" | "vatCode">
  values: PgUpdateSetSource<typeof customers>
}

/**
 * Updates the customers that have any of an imported row's identifiers. A row
 * without identifiers matches none and updates nothing: `or()` with no
 * conditions is undefined, and the update would run without a WHERE on every
 * customer.
 */
export const updateImportedCustomer = async ({
  db,
  identifiers: { tempID, fiscalCode, vatCode },
  values,
}: UpdateImportedCustomerParams) => {
  const match = or(
    tempID ? eq(customers.tempID, tempID) : undefined,
    fiscalCode ? eq(customers.fiscalCode, fiscalCode) : undefined,
    vatCode ? eq(customers.vatCode, vatCode) : undefined
  )
  if (!match) return
  await db.update(customers).set(values).where(match)
}
