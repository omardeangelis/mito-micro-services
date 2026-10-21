"use server"

import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { type AppRouter } from "@mito/server/api/root"
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

// The caller rejects with a `TRPCClientError`: in-process its `cause` is the
// procedure's `TRPCError`, over HTTP (BACKEND_URL) the code is in `data`
const isNotFound = (error: unknown) =>
  error instanceof TRPCClientError &&
  ((error.cause instanceof TRPCError && error.cause.code === "NOT_FOUND") ||
    (error as TRPCClientError<AppRouter>).data?.code === "NOT_FOUND")
