"use server"

import { api } from "@/trpc/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { type AlertWrite, insertAlertSchema } from "@/lib/types/schemas"

type ActionProps = AlertWrite

export async function createAlertAction(props: ActionProps) {
  const alert = insertAlertSchema.safeParse(props)
  if (!alert.success) {
    return {
      message: "",
      error: alert.error.errors[0]?.message ?? "Errore nei dati inseriti",
    }
  }
  await api.task.createAlert.mutate(props)
  revalidateTag("task")
  revalidatePath("/dashboard/customers", "page")
  revalidatePath("/dashboard/customers/[id]", "page")
}

export async function deleteAlertAction(id: number) {
  await api.task.deleteAlerts.mutate({ id })
  revalidateTag("task")
  revalidatePath("/dashboard/customers", "page")
  revalidatePath("/dashboard/customers/[id]", "page")
}
