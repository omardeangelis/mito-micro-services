"use server"

import { api } from "@/trpc/server"
import { readContactError } from "@mito/domain/contact/errors"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const deactivateOperatorInput = z.object({
  operatorId: z.number().int().positive(),
  toOperatorId: z.number().int().positive(),
})

/**
 * Returns `{ error: code }` instead of throwing: in production Next.js strips
 * the message of an error thrown by a server action.
 */
export const deactivateOperatorAction = async (input: unknown) => {
  const data = deactivateOperatorInput.safeParse(input)
  if (!data.success) return { error: "INVALID_INPUT" } as const
  try {
    const result = await api.operator.deactivate.mutate(data.data)
    // `@admin` is a parallel route, not a URL segment
    revalidatePath("/dashboard/profile")
    return { result }
  } catch (e) {
    return { error: readContactError(e)?.code ?? "UNKNOWN" }
  }
}
