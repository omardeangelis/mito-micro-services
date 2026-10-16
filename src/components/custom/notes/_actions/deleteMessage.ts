"use server"

import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = z.object({
  id: z.number().int().positive(),
  customerId: z.string().min(1),
})

export async function deleteMessageAction(values: {
  id: number
  customerId: string
}) {
  const parsedValues = formSchema.safeParse(values)
  if (!parsedValues.success) {
    console.error(parsedValues.error.errors)
    return { ok: false as const, error: "Invalid form data" }
  }

  // The server checks the operator signed in: only the author
  const gone = await api.chat.deleteMessage
    .mutate({ id: parsedValues.data.id })
    .then(
      () => false,
      (error: unknown) => {
        if (isNotFound(error)) return true
        throw error
      }
    )

  revalidatePath(`/dashboard/customers/${parsedValues.data.customerId}`, "page")
  // Already deleted (another tab of the author): the refreshed page drops it
  if (gone) return { ok: false as const, gone: true as const }
  return { ok: true as const }
}

// From a Server Component the caller rejects with a `TRPCClientError` whose
// `cause` is the procedure's `TRPCError`
const isNotFound = (error: unknown) =>
  error instanceof TRPCClientError &&
  error.cause instanceof TRPCError &&
  error.cause.code === "NOT_FOUND"
