"use server"
import { taskStatus } from "@/server/db/schema/task"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const bulkAssignCustomersSchema = z
  .object({
    operatorId: z.string().optional(),
    customerIds: z.string(),
    type: z.enum(["chiamate", "clienti"]).default("chiamate"),
    callType: z.enum(taskStatus).optional(),
  })
  .refine((data) => {
    if (data.type === "chiamate") {
      return data.callType !== undefined
    }
    return true
  })

export async function customerBulkUpdateAction(formData: FormData) {
  const formValues = Object.fromEntries(formData.entries())
  const unRefinedData = bulkAssignCustomersSchema.safeParse(formValues)
  if (!unRefinedData.success) {
    return {
      error: unRefinedData.error.message,
    }
  }
  const { operatorId, customerIds, type, callType } = unRefinedData.data

  const customerIdsArray = customerIds.split(",")
  if (type === "chiamate") {
    await api.task.bulkHandleTask.mutate({
      operatorId: Number(operatorId),
      customerIds: customerIdsArray,
      state: callType,
    })

    revalidatePath("/dashboard/customers", "layout")
  } else {
    await api.customer.bulkUpdateCustomers.mutate({
      operatorId: Number(operatorId),
      customerIds: customerIdsArray,
    })
  }
  revalidatePath("/dashboard/customers", "layout")
}
