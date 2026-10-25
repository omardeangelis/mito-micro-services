import { practices } from "@mito/db/schema/pratiche"
import { eq } from "drizzle-orm"
import { type SupaBaseDb } from "@mito/db/types"

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
