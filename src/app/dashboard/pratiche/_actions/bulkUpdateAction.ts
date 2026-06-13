"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const bulkAssignPracticesSchema = z.object({
  operatorId: z.string(),
  practiceIds: z.string(),
})

type FormState = {
  message?: string
  error?: string
}

export async function bulkUpdateAction(_: FormState, formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())
  const unRefinedData = bulkAssignPracticesSchema.safeParse(formValues)
  if (!unRefinedData.success) {
    return {
      error: unRefinedData.error.message,
    }
  }
  const { operatorId, practiceIds } = unRefinedData.data

  const practiceIdsArray = practiceIds.split(",")

  try {
    await api.pratiche.bulkAssignPractices.mutate({
      operatorId: Number(operatorId),
      practiceIds: practiceIdsArray,
    })
    revalidatePath("/dashboard/pratiche", "layout")
    return {
      message: "Pratiche aggiornate con successo",
    }
  } catch (_error: TODO) {
    return {
      message: "",
      error: "Errore durante l'aggiornamento delle pratiche",
    }
  }
}
