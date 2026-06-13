"use server"

import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = z.object({
  id: z.string(),
  operatorId: z.string(),
})

export async function deleteMessageAction(formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())

  const parsedFormValues = formSchema.safeParse(formValues)
  if (!parsedFormValues.success) {
    console.error(parsedFormValues.error.errors)
    return
  }

  await api.chat.deleteMessage.mutate({
    id: Number(parsedFormValues.data.id),
    operatorId: Number(parsedFormValues.data.operatorId),
  })

  revalidatePath("/dashboard/pratiche/[id]", "page")
}
