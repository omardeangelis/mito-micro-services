"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/trpc/server"
import { z } from "zod"
import { insertCustomerSchema } from "@/lib/types/schemas"
import { cleanObject } from "@/lib/utils"
import { sanitizeRedditoValue } from "@/lib/utils/format"

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
    operatorId: true,
    source: true,
  })
  .merge(z.object({ operatorId: z.string().optional() }))

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
  const { id, birthdayDate, operatorId, ...rest } = unRefinedData.data
  const tasks = await api.task.getActiveTask.query({ id })
  const task = tasks[0]

  if (task) {
    if (task.state === "chiamare") {
      if (task.operatorId?.toString() !== operatorId) {
        await api.task.updateTask.mutate({
          id: task.id,
          operatorId: operatorId ? Number(operatorId) : null,
          isClosed: false,
          state: "chiamare",
        })
      }
    }
  }
  try {
    await api.customer.updateCustomerFromDashboard.mutate({
      id: id,
      birthdayDate: birthdayDate ? new Date(Date.parse(birthdayDate)) : null,
      operatorId: operatorId ? Number(operatorId) : null,
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
