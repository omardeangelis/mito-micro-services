"use client"

import React, { useCallback, useMemo, useState } from "react"
import { Form, FormField, FormItem } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Columns3, FilterIcon, SearchIcon, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { type Column } from "@tanstack/react-table"
import {
  Select,
  SelectContent,
  SelectLabel,
  SelectValue,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  FileCombobox,
  OperatorSelector,
  SedeSelector,
  TaskStatusSelector,
} from "@/components/custom/table/CustomFilters"
import { useGetMultipleUrlParamsValues } from "@/lib/hooks/useGetMultipleUrlParamsValues"
import { DismissableFilterBadges } from "@/components/custom/table/DismissableFilterBadges"
import { useSearchParams } from "next/navigation"
import {
  type FilterOptions,
  useCustomerStore,
} from "../_store/useCustomerStore"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PopoverDateFilter } from "@/components/custom/table/PopoverFilter"
import { CUSTOMER_FILTER_MAP } from "../_constants"

const schema = z.object({
  id: z.string(),
})

type FormData = z.infer<typeof schema>
type FilterBy = "nome" | "surname" | "email" | "telefono" | "fiscalCode"
type FilterItems = { value: FilterBy; label: string }

type FilterKeys = "operatore" | "ambito" | "sede" | "jobs"

type Filter = Record<FilterKeys, string[]>

interface Props<TData> {
  allColumns: Column<TData, unknown>[]
}

export function TableFilterSections<TData>({ allColumns }: Props<TData>) {
  const searchParams = useSearchParams()
  const isOnlyMe = useMemo(
    () => searchParams.get("only_me") === "true",
    [searchParams]
  )
  const showDM = useMemo(
    () => searchParams.get("black_list") === "true",
    [searchParams]
  )

  const router = useRouter()

  const filterableColumns = allColumns
    .filter((column) => column.getCanFilter())
    .map<FilterItems>((c) => {
      return {
        label: c.columnDef.id!,
        // @ts-expect-error accessorKey is private
        value: c.columnDef.accessorKey as FilterBy,
      }
    })

  const [searchBy, setSearchBy] = useState<FilterItems>(() => {
    const value = searchParams.get("search_by") as FilterBy
    const label = filterableColumns.find((c) => c.value === value)?.label
    if (label && value) {
      return { label, value }
    }
    return { label: "Codice Fiscale", value: "fiscalCode" }
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: async () => ({
      id: searchParams.get("q") ?? "",
    }),
  })

  const resetSearchParams = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("q")
    url.searchParams.delete("search_by")
    form.setValue("id", "")
    router.push(url.toString())
  }, [router, form])

  const handleSearchChange = useCallback(
    (label: string) => {
      const item = filterableColumns.find((c) => c.label === label)
      if (!item) return
      resetSearchParams()
      setSearchBy(item)
    },
    [filterableColumns, resetSearchParams]
  )

  const { handleFilterUrlChange, removeFilterSingleFilter, arrayFilters } =
    useGetMultipleUrlParamsValues<Filter>("filter_by", {
      operatore: [],
      ambito: [],
      sede: [],
      jobs: [],
    })

  const handleSubmit = form.handleSubmit((data) => {
    const url = new URL(window.location.href)
    if (data.id === "") {
      url.searchParams.delete("q")
      url.searchParams.delete("search_by")
    } else {
      url.searchParams.set("q", data.id)
      url.searchParams.set("search_by", searchBy.value)
    }

    router.push(url.toString())
  })

  const handleSwitchChange = useCallback(
    (checked: boolean) => {
      const url = new URL(window.location.href)
      if (checked) {
        url.searchParams.set("only_me", "true")
      } else {
        url.searchParams.delete("only_me")
      }
      router.push(url.toString())
    },
    [router]
  )

  const handleDMChange = useCallback(
    (checked: boolean) => {
      const url = new URL(window.location.href)
      if (checked) {
        url.searchParams.set("black_list", "true")
      } else {
        url.searchParams.delete("black_list")
      }
      router.push(url.toString())
    },
    [router]
  )

  const handleSelectChange = useCallback(
    (value: string, columnId: string) => {
      handleFilterUrlChange(value, columnId)
    },
    [handleFilterUrlChange]
  )

  const { filterOption } = useCustomerStore()
  const filterClasses = useMemo(() => {
    const searchClasses = cn(
      "flex items-center gap-2",
      filterOption.includes("search") ? "flex" : "hidden"
    )
    const filterClasses = cn(
      "flex w-full items-center justify-end gap-4",
      filterOption.includes("filter") ? "flex" : "hidden"
    )

    return { searchClasses, filterClasses }
  }, [filterOption])

  return (
    <div className="sticky left-0 top-0 z-10 flex w-full flex-col gap-2 border-b border-neutral-200 bg-card p-4">
      <div className="flex w-full items-center gap-2">
        <ToggleGroupDemo />
        <div className={filterClasses.searchClasses}>
          <Select onValueChange={handleSearchChange} value={searchBy.value}>
            <SelectTrigger className="min-w-[150px]">
              <SelectValue>
                <span>{searchBy.label}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Cerca per</SelectLabel>
                {filterableColumns.map((column) => {
                  return (
                    <SelectItem
                      value={column.label as FilterBy}
                      key={column.value}
                    >
                      {column.label}
                    </SelectItem>
                  )
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Form {...form}>
            <form
              className="flex w-full min-w-[300px] items-center gap-2"
              onSubmit={handleSubmit}
            >
              <FormField
                name="id"
                control={form.control}
                render={({ field }) => {
                  return (
                    <FormItem className="w-full max-w-sm">
                      <Input
                        placeholder={`Cerca per ${searchBy.label}`}
                        {...field}
                        className="w-full"
                      />
                    </FormItem>
                  )
                }}
              />
              <Button disabled={!form.formState.isValid} type="submit">
                Cerca
              </Button>
            </form>
          </Form>
        </div>
        <div className={filterClasses.filterClasses}>
          {filterOption.includes("filter") &&
          !filterOption.includes("search") ? (
            <>
              <div className="flex items-center space-x-2">
                <Switch
                  id="black-list"
                  defaultChecked={showDM}
                  onCheckedChange={handleDMChange}
                />
                <Label htmlFor="black-list">Show DM</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="only-me"
                  defaultChecked={isOnlyMe}
                  onCheckedChange={handleSwitchChange}
                />
                <Label htmlFor="only-me">Only me</Label>
              </div>
            </>
          ) : null}
          <div>
            <PopoverDateFilter filterMap={CUSTOMER_FILTER_MAP} />
          </div>
          <div>
            <OperatorSelector
              onValueChange={(value) => handleSelectChange(value, "operatore")}
            />
          </div>
          <div>
            <SedeSelector
              onValueChange={(value) => handleSelectChange(value, "sede")}
            />
          </div>
          <div>
            <TaskStatusSelector
              onValueChange={(value) => handleSelectChange(value, "status")}
            />
          </div>
          <div>
            <FileCombobox
              table="customers"
              onValueChange={(value) => handleSelectChange(value, "file")}
            />
          </div>
        </div>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3 size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allColumns
                .filter(
                  (column) =>
                    column.getCanHide() && column.columnDef.id !== "id"
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {form.getValues().id ? (
        <Badge
          className="badge-with-close mt-2 w-fit"
          variant="secondary"
          onClick={resetSearchParams}
        >
          <div className="flex w-fit items-center">
            {searchBy.label}: {form.getValues().id}
            <span
              data-close
              className="badge-close-icon ml-2 flex items-center justify-center"
            >
              <X size={16} />
            </span>
          </div>
        </Badge>
      ) : null}
      <div className="flex w-full flex-wrap gap-2">
        <DismissableFilterBadges
          arrayFilters={arrayFilters}
          removeFilterSingleFilter={removeFilterSingleFilter}
        />
      </div>
    </div>
  )
}

export function ToggleGroupDemo() {
  const { setFilterOption, filterOption } = useCustomerStore()
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={filterOption}
      onValueChange={(values: FilterOptions[]) => setFilterOption(values)}
    >
      <ToggleGroupItem value="search" aria-label="Toggle bold">
        <SearchIcon size={16} />
      </ToggleGroupItem>
      <ToggleGroupItem value="filter" aria-label="Toggle italic">
        <FilterIcon size={16} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
