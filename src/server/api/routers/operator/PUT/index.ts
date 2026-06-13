import { adminProcedure, operatorProcedure } from "@/server/api/trpc"
import { operators } from "@/server/db/schema/operators"
import { eq, inArray } from "drizzle-orm"
import { insertOperatorSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { users } from "@/server/db/schema/users"

const operatorInsertSchema = insertOperatorSchema.pick({
  name: true,
  surname: true,
})

export const updateOperatorInfo = operatorProcedure
  .input(operatorInsertSchema)
  .mutation(async ({ ctx, input }) => {
    const { db, operator } = ctx
    await db
      .update(operators)
      .set(input)
      .where(eq(operators.id, operator.id))
      .returning({
        name: operators.name,
        surname: operators.surname,
      })
    return operator
  })

const updateOperatorsRoleInput = z.array(
  z.object({
    id: z.number(),
    role: z.enum(["ADMIN", "OPERATORE"]),
  })
)

export const updateOperatorsRole = adminProcedure
  .input(updateOperatorsRoleInput)
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx
    const operatorsToEdit = await db
      .select({
        id: operators.id,
        userId: operators.userId,
      })
      .from(operators)
      .where(
        inArray(
          operators.id,
          input.map((op) => op.id)
        )
      )

    const operatorsIds = operatorsToEdit.map((op) => ({
      userId: op.userId,
      role: input.find((i) => i.id === op.id)!.role,
    }))

    for await (const op of operatorsIds) {
      await db
        .update(users)
        .set({
          role: op.role,
        })
        .where(eq(users.id, op.userId))
    }

    return input
  })
