"use client"

import { useSearchParams } from "next/navigation"

export const useGetPageAndPerPageParams = () => {
  const searchParams = useSearchParams()
  const page = searchParams.get("page")
  const perPage = searchParams.get("per_page")
  return { page, perPage }
}
