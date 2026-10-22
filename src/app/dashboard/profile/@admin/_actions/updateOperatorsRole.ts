"use server"

import { api } from "@/trpc/server"
import { readContactError } from "@mito/domain/contact/errors"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const updateOperatorsRoleInput = z.array(
  z.object({
    id: z.number(),
    role: z.enum(["ADMIN", "OPERATORE"]),
  })
)

/** Returns `{ error: code }` instead of throwing (see deactivateOperator). */
export const updateOperatorsRoleAction = async (input: unknown) => {
  const data = updateOperatorsRoleInput.safeParse(input)
  if (!data.success) return { error: "INVALID_INPUT" } as const
  try {
    await api.operator.updateOperatorsRole.mutate(data.data)
    // `@admin` is a parallel route, not a URL segment
    revalidatePath("/dashboard/profile")
    return {}
  } catch (e) {
    return { error: readContactError(e)?.code ?? "UNKNOWN" }
  }
}
