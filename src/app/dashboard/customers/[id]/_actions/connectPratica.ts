"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { type CustomerToPraticaWrite } from "@/lib/types/schemas"
import { type CreateNewPraticaInput } from "../connect/_components/NewPraticaForm"
import { getProductKey } from "@/lib/constants/productMap"

const createPratica = async (input: CreateNewPraticaInput) => {
  const { pratica, customers, customerID } = input
  const praticaID = await api.pratiche.insertPratica.mutate({
    ...pratica,
    productId: getProductKey(pratica.productId),
    fileName: "manual",
  })
  await Promise.all(
    customers.map((c) =>
      api.customer.insertCustomer.mutate({
        ...c,
        id: c.id!.toString(),
        fileName: "manual",
      })
    )
  )
  const customerToPratica: CustomerToPraticaWrite[] = customers.map((c) => ({
    customerId: c.id!.toString(),
    customerRole: c.role,
    praticaId: praticaID!.id.toString(),
  }))
  customerToPratica.unshift({
    customerId: customerID,
    customerRole: "Intestatario",
    praticaId: praticaID!.id.toString(),
  })
  await Promise.all(
    customerToPratica.map((c) =>
      api.pratiche.connectPraticaAndCustomer.mutate({
        customerId: c.customerId,
        praticaId: praticaID!.id.toString(),
        customerRole: c.customerRole,
      })
    )
  )

  return customerID
}

export const createNewPraticaAction = async (input: CreateNewPraticaInput) => {
  let customerID = ""
  try {
    customerID = await createPratica(input)
  } catch (_error: TODO) {
    return {
      error: "Questa pratica esiste già",
      redirectUrl: "",
    }
  }
  revalidatePath("/dashboard/pratiche", "layout")
  revalidatePath("/dashboard/customers", "layout")
  return {
    error: "",
    redirectUrl: `/dashboard/customers/${customerID}`,
  }
}
