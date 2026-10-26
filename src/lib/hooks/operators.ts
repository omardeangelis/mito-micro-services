"use client"

import { api } from "@/trpc/react"
import { cache } from "react"

export const useAllUniqueOperators = cache(() =>
  api.operator.getAllUniqueOperators.useQuery()
)

export const useGetOperatorById = cache((id: number | undefined) =>
  // Without an id the query waits: the `0` is never sent
  api.operator.getOperatorById.useQuery(
    { id: id ?? 0 },
    { enabled: id !== undefined }
  )
)
