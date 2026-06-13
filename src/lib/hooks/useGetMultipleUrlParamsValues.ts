import { useSearchParams, useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { generateFilter, type FilterType } from "../utils/filters"

const filterWithMultipleValues = [
  "productId",
  "comune",
  "sede",
  "ambito",
  "jobs",
  "status",
]

export function useGetMultipleUrlParamsValues<T extends FilterType>(
  params_key: string,
  initialFilter: T
) {
  const searchParams = useSearchParams()
  const router = useRouter()

  let defaultFilter: string[] = useMemo(() => [], [])
  const get = searchParams.get(params_key)
  if (get) {
    defaultFilter = get.split(",").map((p) => decodeURIComponent(p))
  }

  const parsed = useMemo(
    () =>
      defaultFilter.map((p) =>
        p.split("=").map((p) => p.replace("[", "").replace("]", ""))
      ),
    [defaultFilter]
  )

  const map = useMemo(
    () => new Map(parsed as Iterable<[string, string]>),
    [parsed]
  )

  const [filters, setFilters] = useState<T>(() =>
    generateFilter(map, initialFilter)
  )

  const handleFilterUrlChange = useCallback(
    (value: string, columnId: string, cb?: () => void) => {
      const url = new URL(window.location.href)
      if (value === "all") {
        map.delete(columnId)
      } else {
        let valueToSet = value
        if (
          filterWithMultipleValues.includes(columnId) &&
          map.get(columnId) &&
          !map.get(columnId)?.includes(value)
        ) {
          valueToSet = `${map.get(columnId)}-${value}`
        }
        map.set(columnId, valueToSet)
      }
      const params = Array.from(map.entries()).map(
        ([key, value]) => `[${key}]=${value}`
      )

      if (params.length === 0) {
        url.searchParams.delete("filter_by")
      } else {
        url.searchParams.set(
          "filter_by",
          params.map((p) => encodeURIComponent(p)).join(",")
        )
      }

      setFilters(generateFilter(map, initialFilter))

      if (cb) {
        cb()
      }

      router.push(url.toString())
    },
    [map, router, initialFilter]
  )

  const removeFilterSingleFilter = useCallback(
    (key: string, value: string, cb?: () => void) => {
      const url = new URL(window.location.href)
      const targetFilter = filters[key as keyof T]
      if (targetFilter?.length) {
        const newFilter = targetFilter.flat().filter((v) => v !== value)
        if (newFilter.length) {
          map.set(key, newFilter.join("-"))
        } else {
          map.delete(key)
        }

        const params = Array.from(map.entries()).map(
          ([key, value]) => `[${key}]=${value}`
        )
        setFilters(generateFilter(map, initialFilter))

        if (params.length === 0) {
          url.searchParams.delete("filter_by")
        } else {
          url.searchParams.set(
            "filter_by",
            params.map((p) => encodeURIComponent(p)).join(",")
          )
        }
        if (cb) {
          cb()
        }

        router.push(url.toString())
      }
    },
    [filters, initialFilter, map, router]
  )

  const arrayFilters = useMemo(
    () =>
      Object.entries(filters).map(([key, value]) => ({
        key,
        value,
      })) as { key: keyof T; value: string[] }[],
    [filters]
  )

  return {
    map,
    filters,
    arrayFilters,
    setFilters,
    handleFilterUrlChange,
    removeFilterSingleFilter,
  }
}

export const useGetFilterMap = (params_key: string) => {
  const searchParams = useSearchParams()
  let defaultFilter: string[] = useMemo(() => [], [])
  const get = searchParams.get(params_key)
  if (get) {
    defaultFilter = get.split(",").map((p) => decodeURIComponent(p))
  }

  const parsed = useMemo(
    () =>
      defaultFilter.map((p) =>
        p.split("=").map((p) => p.replace("[", "").replace("]", ""))
      ),
    [defaultFilter]
  )

  return useMemo(() => new Map(parsed as Iterable<[string, string]>), [parsed])
}
