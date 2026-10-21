"use server"
import { insertMessageSchema } from "@mito/domain/schemas"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = insertMessageSchema
  .pick({
    chatId: true,
    content: true,
  })
  .merge(
    z.object({
      chatId: z.number().int().positive(),
      customerId: z.string().min(1),
    })
  )

export async function updateChatAction(values: {
  chatId: number
  content: string
  customerId: string
}) {
  const parsedValues = formSchema.safeParse(values)
  if (!parsedValues.success) {
    console.error(parsedValues.error.errors)
    return { ok: false as const, error: "Invalid form data" }
  }

  const [chatOperators, userOperator] = await Promise.all([
    api.chat.getUniqueChatOperator.query({ id: parsedValues.data.chatId }),
    api.operator.getUserOperator.query(),
  ])

  const hasOperatorAlreadyChatted = chatOperators.some(
    (o) => o.operator === userOperator.id
  )

  if (!hasOperatorAlreadyChatted) {
    await api.chat.addOperatorToChat.mutate({
      chatId: parsedValues.data.chatId,
    })
  }

  const message = await api.chat.insertMessage.mutate({
    chatId: parsedValues.data.chatId,
    content: parsedValues.data.content,
  })

  revalidatePath(`/dashboard/customers/${parsedValues.data.customerId}`, "page")

  if (!message) return { ok: false as const, error: "Message not saved" }
  return { ok: true as const, id: message.id }
}
