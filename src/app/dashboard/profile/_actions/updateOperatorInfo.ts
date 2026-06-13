"use server"

import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"
import { insertOperatorSchema } from "@/lib/types/schemas"

const operatorInsertSchema = insertOperatorSchema.pick({
  name: true,
  surname: true,
})

type FormInitialState = {
  message: string
}

export const updateOperatorInfo = async (
  _: FormInitialState,
  formData: FormData
) => {
  const formValues = Object.fromEntries(formData.entries())
  const operator = operatorInsertSchema.safeParse(formValues)
  if (!operator.success) {
    throw new Error("Invalid form data")
  }
  const data = operator.data

  await api.operator.updateOperatorInfo.mutate(data)
  revalidatePath("/dashboard/profile")
  return {
    message: "Operator updated successfully",
  }
}
