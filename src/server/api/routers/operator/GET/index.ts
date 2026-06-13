import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { users } from "@/server/db/schema/users"
import { operators } from "@/server/db/schema/operators"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { operatorSelectCompleteResponse } from "@/lib/constants/schema"

export const getAllUniqueOperators = protectedProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    const allOperators = await db
      .selectDistinct({
        ...operatorSelectCompleteResponse,
        role: users.role,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
    return allOperators
  }
)

const getOperatorByIdInput = z.object({
  id: z.number().optional(),
})

export const getOperatorById = protectedProcedure
  .input(getOperatorByIdInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const operator = await db
      .select({
        ...operatorSelectCompleteResponse,
        role: users.role,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(input.id ? eq(operators.id, input.id) : undefined)
    return operator[0]
  })

export const getUserOperator = operatorProcedure.query(async ({ ctx }) => {
  const { operator } = ctx
  return operator
})

export const getUserPublicOperator = protectedProcedure.query(
  async ({ ctx }) => {
    const { db, session } = ctx
    const operator = await db
      .select({
        id: operators.id,
        name: operators.name,
        surname: operators.surname,
      })
      .from(operators)
      .where(eq(operators.userId, session.user.id))
    return operator[0]
  }
)
