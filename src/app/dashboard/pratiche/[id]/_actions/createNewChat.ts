"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const formSchema = z.object({
  id: z.string(),
  type: z.enum(["pratica", "customer"]),
})

export async function createChatAction(formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())
  const parsedFormValues = formSchema.safeParse(formValues)
  if (!parsedFormValues.success) {
    console.error(parsedFormValues.error.errors)
    return { error: "Invalid form data" }
  }
  if (parsedFormValues.data.type === "pratica") {
    await api.chat.createNewChat.mutate({
      praticaId: parsedFormValues.data.id,
    })
    revalidatePath(`/dashboard/pratiche/${parsedFormValues.data.id}`, "page")
  } else {
    await api.chat.createNewCustomerChat.mutate({
      customerId: parsedFormValues.data.id,
    })
    revalidatePath(`/dashboard/customers/${parsedFormValues.data.id}`, "page")
  }
}
