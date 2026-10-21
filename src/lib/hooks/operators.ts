"use client"

import { api } from "@/trpc/react"
import { cache } from "react"

export const useAllUniqueOperators = cache(() =>
  api.operator.getAllUniqueOperators.useQuery()
)

export const useGetOperatorById = cache((id: number | undefined) =>
  api.operator.getOperatorById.useQuery({ id })
)
