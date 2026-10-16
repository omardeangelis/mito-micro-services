"use server"

import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = z.object({
  id: z.number().int().positive(),
  operatorId: z.number().int().positive(),
  customerId: z.string().min(1),
})

export async function deleteMessageAction(values: {
  id: number
  operatorId: number
  customerId: string
}) {
  const parsedValues = formSchema.safeParse(values)
  if (!parsedValues.success) {
    console.error(parsedValues.error.errors)
    return { ok: false as const, error: "Invalid form data" }
  }

  await api.chat.deleteMessage.mutate({
    id: parsedValues.data.id,
    operatorId: parsedValues.data.operatorId,
  })

  revalidatePath(`/dashboard/customers/${parsedValues.data.customerId}`, "page")
  return { ok: true as const }
}
