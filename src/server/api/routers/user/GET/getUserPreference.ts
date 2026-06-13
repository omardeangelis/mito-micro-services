import { type SupaBaseDb } from "@/lib/types"
import { type UserPreference } from "@/lib/types/schemas"
import { protectedProcedure } from "@/server/api/trpc"
import { operators } from "@/server/db/schema/operators"
import { users } from "@/server/db/schema/users"
import { eq } from "drizzle-orm"

type RetrivePreferenceType = {
  id: string
  db: SupaBaseDb
}

export const retrieveUserPrefercence = async ({
  db,
  id,
}: RetrivePreferenceType) => {
  const userPreference = await db
    .select({
      preference: users.preferences,
      role: users.role,
      operatorId: operators.id,
    })
    .from(users)
    .innerJoin(operators, eq(users.id, operators.userId))
    .where(eq(users.id, id))

  const preferences = JSON.parse(
    userPreference[0]?.preference ?? "{}"
  ) as UserPreference

  return {
    preferences,
    role: userPreference[0]?.role,
    operatorId: userPreference[0]?.operatorId,
  }
}

export const getUserPreference = protectedProcedure.query(async ({ ctx }) => {
  const { db, session } = ctx
  const user = session.user
  return retrieveUserPrefercence({ db, id: user.id })
})
