"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { insertPracticeSchema } from "@/lib/types/schemas"

const updatePraticaFormData = insertPracticeSchema
  .merge(
    z.object({
      id: z.string(),
    })
  )
  .pick({
    id: true,
    state: true,
  })

type FormState = {
  message: string
}

export async function updatePraticaAction(_: FormState, formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())
  const unRefinedData = updatePraticaFormData.safeParse(formValues)
  if (!unRefinedData.success) {
    return {
      message: "Errore nei dati inseriti",
    }
  }
  const { id, state } = unRefinedData.data

  await api.pratiche.updatePraticaFromDashboard.mutate({
    id: Number(id),
    state,
  })
  revalidatePath("/dashboard/pratiche", "layout")
  return {
    message: "Pratica aggiornata con successo",
  }
}
