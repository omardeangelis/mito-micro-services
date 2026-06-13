"use server"
import { insertMessageSchema } from "@/lib/types/schemas"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = insertMessageSchema
  .merge(
    z.object({
      chatId: z.string(),
    })
  )
  .pick({
    chatId: true,
    content: true,
  })

export async function updateChatAction(formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())

  const parsedFormValues = formSchema.safeParse(formValues)
  if (!parsedFormValues.success) {
    console.error(parsedFormValues.error.errors)
    return { error: "Invalid form data" }
  }

  const chatOperators = await api.chat.getUniqueChatOperator.query({
    id: Number(parsedFormValues.data.chatId),
  })

  const userOperator = await api.operator.getUserOperator.query()

  const hasOperatorAlreadyChatted = chatOperators.some(
    (o) => o.operator === userOperator.id
  )

  if (!hasOperatorAlreadyChatted) {
    await api.chat.addOperatorToChat.mutate({
      chatId: Number(parsedFormValues.data.chatId),
    })
  }

  await api.chat.insertMessage.mutate({
    chatId: Number(parsedFormValues.data.chatId),
    content: parsedFormValues.data.content,
  })

  revalidatePath("/dashboard/pratiche/[id]", "page")
}
