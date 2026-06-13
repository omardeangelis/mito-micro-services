import {
  PopoverTrigger,
  Popover,
  PopoverContent,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { nanoid } from "nanoid"
import { SelectValue, Separator } from "@radix-ui/react-select"

import { Input } from "@/components/ui/input"
import { X } from "lucide-react"
import {
  createFilterFromString,
  validateAndFormatDate,
} from "@/lib/utils/filters"
import { type PgColumn } from "drizzle-orm/pg-core"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import ErrorBoundary from "./PopoverFilterErrorBoundary"

type Operatortypes = "eq" | "gt" | "lt" | "gte" | "lte"

type CustomFilter = {
  id: string
  name: string
  value: string
  operator: Operatortypes
}

const filterSymbolMap = new Map<Operatortypes, string>([
  ["eq", "="],
  ["gt", ">"],
  ["lt", "<"],
  ["gte", ">="],
  ["lte", "<="],
])

const PopoverDateItemContext = createContext<{
  activeFilter: CustomFilter[]
  filterMap: Map<string, PgColumn>
  setActiveFilter: React.Dispatch<React.SetStateAction<CustomFilter[]>>
  removeFilter: (id: string) => void
  errorsField: Array<{ id: string; error: string }>
}>({
  activeFilter: [],
  filterMap: new Map(),
  setActiveFilter: () => undefined,
  removeFilter: () => undefined,
  errorsField: [],
})

export const PopoverDateFilter = ({
  filterMap,
}: {
  filterMap: Map<string, PgColumn>
}) => {
  const [activeFilter, setActiveFilter] = useState<CustomFilter[]>([])
  const [appliedFilter, setAppliedFilter] = useState<number>(0)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const addEmptyFilter = useCallback(() => {
    setActiveFilter((prev) => [
      ...prev,
      {
        id: nanoid(),
        name: filterMap.keys().next().value!,
        value: "",
        operator: "eq",
      },
    ])
  }, [filterMap])

  const getMapKeyFromValue = useCallback(
    (value: string) => {
      return Array.from(filterMap).find(([_, v]) => v.name === value)?.[0]
    },
    [filterMap]
  )

  const removeFilter = useCallback((id: string) => {
    setActiveFilter((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const clearAllFilters = useCallback(() => {
    setActiveFilter([])
  }, [])

  const [errorsField, setErrorFields] = useState<
    Array<{ id: string; error: string }>
  >([])

  const setFilterAsSearchParams = useCallback(
    (filter: CustomFilter, url: URL) => {
      let value = filter.value as string | null
      if (filterMap.get(filter.name)?.dataType === "date") {
        value = validateAndFormatDate(filter.value)
      }
      if (!value)
        return setErrorFields((prev) => [
          ...prev,
          { id: filter.id, error: "Invalid date" },
        ])

      setErrorFields((prev) => prev.filter((e) => e.id !== filter.id))
      const filterTuple = [
        filterMap.get(filter.name)?.name,
        filter.operator,
        value,
      ].join(":")
      url.searchParams.append("filter", filterTuple)
    },
    [filterMap]
  )

  const applyFilter = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("filter")
    window.history.replaceState({}, "", url.toString())
    activeFilter.forEach((filter) => {
      if (filter.value) setFilterAsSearchParams(filter, url)
    })
    router.push(url.toString())
    setAppliedFilter(activeFilter.length)
    setOpen(false)
  }, [activeFilter, setFilterAsSearchParams, router])

  useEffect(() => {
    const url = new URL(window.location.href)
    const filters = url.searchParams.getAll("filter")
    if (filters.length > 0) {
      setActiveFilter(
        filters.map((f) => {
          const filter = createFilterFromString(f)
          return {
            id: nanoid(),
            name: getMapKeyFromValue(filter!.name) ?? "Nato il",
            operator: filter?.operator ?? "eq",
            value: filter?.value ?? "",
          }
        })
      )
    }
  }, [getMapKeyFromValue])

  const ctx = useMemo(
    () => ({
      activeFilter,
      setActiveFilter,
      removeFilter,
      filterMap,
      errorsField,
    }),
    [activeFilter, removeFilter, filterMap, errorsField]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="relative">
          Filtri Avanzati
          {appliedFilter > 0 && (
            <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
              {appliedFilter}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[320px] rounded-md border bg-white p-4 shadow-sm">
        <ErrorBoundary handleError={clearAllFilters}>
          <div className="flex flex-col gap-4">
            <PopoverDateItemContext.Provider value={ctx}>
              {activeFilter.length > 0 ? (
                activeFilter.map((filtro) => (
                  <div className="w-full" key={filtro.id}>
                    <AdvancedFilter filtro={filtro} />
                    {errorsField.find((e) => e.id === filtro.id) && (
                      <div className="mr-8 mt-1 flex items-center justify-end gap-4 text-xxs text-red-500">
                        <span>
                          {errorsField.find((e) => e.id === filtro.id)?.error}
                        </span>
                        <span className="w-30" />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div>Nessun Filtro attivo</div>
              )}
            </PopoverDateItemContext.Provider>

            <Separator className="border border-neutral-100" />
            <footer className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={addEmptyFilter}>
                Aggiungi filtro
              </Button>
              {activeFilter.length > 0 ? (
                <Button size="sm" variant="outline" onClick={applyFilter}>
                  Applica
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={applyFilter}>
                  Rimuovi Filtri
                </Button>
              )}
            </footer>
          </div>
        </ErrorBoundary>
      </PopoverContent>
    </Popover>
  )
}

const AdvancedFilter = ({ filtro }: { filtro: CustomFilter }) => {
  const { setActiveFilter, removeFilter, filterMap, errorsField } =
    React.useContext(PopoverDateItemContext)
  const filterProps = useMemo(
    () => ({
      columnType: filterMap.get(filtro.name)!.columnType,
      enumValues: filterMap.get(filtro.name)!.enumValues,
      dataType: filterMap.get(filtro.name)!.dataType,
    }),
    [filtro.name, filterMap]
  )

  const allowedOperators = useMemo(() => {
    if (filterProps.columnType === "PgEnumColumn") {
      return ["eq"]
    }
    if (filterProps.columnType === "PgNumeric") {
      return ["eq", "gt", "lt", "gte", "lte"]
    }
    switch (filterProps.dataType) {
      case "date":
        return ["eq", "gt", "lt", "gte", "lte"]
      case "number":
        return ["eq", "gt", "lt", "gte", "lte"]
      default:
        return ["eq"]
    }
  }, [filterProps]) satisfies Operatortypes[]

  return (
    <div className="flex w-full items-center gap-4" key={filtro.id}>
      <Select
        value={filtro.name}
        onValueChange={(value) => {
          setActiveFilter((prev) =>
            prev.map((f) =>
              f.id === filtro.id
                ? { ...f, name: value, operator: "eq", value: "" }
                : f
            )
          )
        }}
      >
        <SelectTrigger className="h-8 w-full min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Nome</SelectLabel>
            {Array.from(filterMap.keys()).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={filterSymbolMap.get(filtro.operator)}
        onValueChange={(value: Operatortypes) => {
          setActiveFilter((prev) =>
            prev.map((f) =>
              f.id === filtro.id ? { ...f, operator: value } : f
            )
          )
        }}
      >
        <SelectTrigger className="h-8 min-w-32">
          <SelectValue>{filterSymbolMap.get(filtro.operator)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Operatore</SelectLabel>
            {allowedOperators.map((value) => (
              <SelectItem key={value} value={value}>
                {filterSymbolMap.get(value)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {filterMap.get(filtro.name)?.columnType === "PgEnumColumn" ? (
        <Select
          value={filtro.value}
          onValueChange={(value: Operatortypes) => {
            setActiveFilter((prev) =>
              prev.map((f) => (f.id === filtro.id ? { ...f, value } : f))
            )
          }}
        >
          <SelectTrigger className="h-8 min-w-32">
            <SelectValue>{filtro.value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Operatore</SelectLabel>
              {filterMap.get(filtro.name)?.enumValues?.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Input
          className={clsx(
            "h-8",
            errorsField.find((e) => e.id === filtro.id) && "border-red-500"
          )}
          value={filtro.value}
          placeholder={
            filterMap.get(filtro.name)?.dataType === "date" ? "aaaa-mm-gg" : ""
          }
          onChange={(e) => {
            setActiveFilter((prev) =>
              prev.map((f) =>
                f.id === filtro.id ? { ...f, value: e.target.value } : f
              )
            )
          }}
        />
      )}

      <Button
        size="icon"
        className="h-8 w-full max-w-[24px]"
        onClick={() => removeFilter(filtro.id)}
        variant="ghost"
      >
        <X size={12} />
      </Button>
    </div>
  )
}
