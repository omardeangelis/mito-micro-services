"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/trpc/server"
import { z } from "zod"
import { insertCustomerSchema } from "@mito/domain/schemas"
import { cleanObject } from "@/lib/utils"
import { sanitizeRedditoValue } from "@mito/client/format"

type FormState = {
  message: string
  error: string
}

const updateCustomerFromDashboardSchema = insertCustomerSchema
  .merge(
    z.object({
      id: z.string(),
      birthdayDate: z.string().optional(),
    })
  )
  .pick({
    id: true,
    name: true,
    surname: true,
    email: true,
    phoneNumber: true,
    address: true,
    cap: true,
    comune: true,
    provincia: true,
    birthdayDate: true,
    reddito: true,
    occupazione: true,
    ambitoLavorativo: true,
    sede: true,
    source: true,
  })

export async function updateCustomerAction(_: FormState, formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())
  const unRefinedData = updateCustomerFromDashboardSchema.safeParse(
    cleanObject(formValues)
  )

  if (!unRefinedData.success) {
    return {
      message: "",
      error:
        unRefinedData.error.errors[0]?.message ?? "Errore nei dati inseriti",
    }
  }
  // The operator changes only through the handover (D13)
  const { id, birthdayDate, ...rest } = unRefinedData.data
  try {
    await api.customer.updateCustomerFromDashboard.mutate({
      id: id,
      birthdayDate: birthdayDate ? new Date(Date.parse(birthdayDate)) : null,
      ...rest,
      reddito: sanitizeRedditoValue(rest.reddito),
    })
    revalidatePath("/dashboard/customers", "layout")
    return {
      message: "Cliente aggiornato con successo",
      error: "",
    }
  } catch (_error) {
    return {
      message: "",
      error: "Errore durante l'aggiornamento del cliente",
    }
  }
}
