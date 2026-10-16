"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = z.object({
  customerId: z.string().min(1),
})

export async function createChatAction(values: { customerId: string }) {
  const parsedValues = formSchema.safeParse(values)
  if (!parsedValues.success) {
    console.error(parsedValues.error.errors)
    return { error: "Invalid form data" }
  }
  await api.chat.createNewCustomerChat.mutate({
    customerId: parsedValues.data.customerId,
  })
  revalidatePath(`/dashboard/customers/${parsedValues.data.customerId}`, "page")
}
