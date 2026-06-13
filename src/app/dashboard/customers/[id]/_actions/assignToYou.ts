"use server"

import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"

export async function assignToYouAction(id: string) {
  await api.customer.assignToYourself.mutate({ id })
  revalidatePath("/dashboard/customers/[id]", "layout")
}
