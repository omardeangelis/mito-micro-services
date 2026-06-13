"use server"

import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const updateOperatorsRoleInput = z.array(
  z.object({
    id: z.number(),
    role: z.enum(["ADMIN", "OPERATORE"]),
  })
)

export const updateOperatorsRoleAction = async (input: unknown) => {
  const data = updateOperatorsRoleInput.safeParse(input)
  if (!data.success) {
    return {
      error: data.error.errors,
    }
  }
  await api.operator.updateOperatorsRole.mutate(data.data)
  return revalidatePath("/dashboard/profile/admin", "page")
}
