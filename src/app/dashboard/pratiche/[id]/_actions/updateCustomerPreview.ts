"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const validationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  phoneNumber: z.string(),
})

type FormState = {
  message: string
}

export async function updateCustomerPreviewAction(
  _: FormState,
  formData: FormData
) {
  const formValues = Object.fromEntries(formData.entries())
  const unRefinedData = validationSchema.safeParse(formValues)
  if (!unRefinedData.success) {
    return {
      message: "Errore nei dati inseriti",
    }
  }
  const { id, email, phoneNumber } = unRefinedData.data

  try {
    await api.pratiche.updateCustomerPreview.mutate({
      id: id,
      email,
      phoneNumber,
    })
    revalidatePath("/dashboard/pratiche/[id]", "page")
    return {
      message: "Cliente aggiornato con successo",
    }
  } catch (_error: TODO) {
    return {
      message: "Errore durante l'aggiornamento del cliente",
    }
  }
}
