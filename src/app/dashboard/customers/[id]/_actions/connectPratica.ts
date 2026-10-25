"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type CreateNewPraticaInput } from "../connect/_components/NewPraticaForm"
import { getProductKey } from "@mito/domain/constants/productMap"

export const createNewPraticaAction = async (input: CreateNewPraticaInput) => {
  const { pratica, customers, customerID } = input
  try {
    await api.pratiche.createPratica.mutate({
      pratica: { ...pratica, productId: getProductKey(pratica.productId) },
      customerId: customerID,
      relatedCustomers: customers.map((c) => ({ ...c, id: c.id!.toString() })),
    })
  } catch (error: unknown) {
    return { error: describeContactError(error), redirectUrl: "" }
  }
  revalidatePath("/dashboard/pratiche", "layout")
  revalidatePath("/dashboard/customers", "layout")
  return {
    error: "",
    redirectUrl: `/dashboard/customers/${customerID}`,
  }
}
