import { practices } from "../db/schema/pratiche"
import { customers } from "../db/schema/customers"
import { eq } from "drizzle-orm"
import { type SupaBaseDb } from "@/lib/types"

type UpdateAtParams = {
  id: string
  db: SupaBaseDb
}

export const updatePracticeUpdatedAt = async (params: UpdateAtParams) => {
  const { db } = params
  return await db
    .update(practices)
    .set({ updatedAt: new Date() })
    .where(eq(practices.praticaId, params.id))
}

export const updateCustomerUpdatedAt = async (params: UpdateAtParams) => {
  const { db } = params
  return await db
    .update(customers)
    .set({ updatedAt: new Date() })
    .where(eq(customers.id, params.id))
}
