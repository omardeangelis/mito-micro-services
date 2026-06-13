"use server"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"

type Props = {
  customerId: string
  blackListStatus: "blacklisted" | "whitelisted" | "review"
}

export const handleCustomerBlackList = async (input: Props) => {
  await api.customer.handleCustomerBlackList.mutate({
    id: input.customerId,
    blackListStatus: input.blackListStatus,
  })
  revalidatePath("/dashboard/customers", "layout")
  revalidatePath("/dashboard/profile/@blacklist", "layout")
}
