"use client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Form, FormField, FormItem } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { type SearchBy } from "@/lib/types"
import { X } from "lucide-react"
import React, { useCallback } from "react"
import { useForm } from "react-hook-form"
import z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams, useRouter } from "next/navigation"
import { type Column } from "@tanstack/react-table"
import { useGetMultipleUrlParamsValues } from "@/lib/hooks/useGetMultipleUrlParamsValues"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DismissableFilterBadges } from "@/components/custom/table/DismissableFilterBadges"
import { FileCombobox } from "@/components/custom/table/CustomFilters"
import { PopoverDateFilter } from "@/components/custom/table/PopoverFilter"
import { PRATICA_FILTER_MAP } from "../../customers/_constants"

const schema = z.object({
  id: z.string(),
})

type FilterKeys = "productId" | "operatore" | "state"

type Filter = Record<FilterKeys, string[]>

interface Props<TData> {
  allColumns: Column<TData, unknown>[]
}

type FormData = z.infer<typeof schema>

export function TableFilterSection<TData>({ allColumns }: Props<TData>) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const {
    handleFilterUrlChange,
    filters,
    removeFilterSingleFilter,
    arrayFilters,
  } = useGetMultipleUrlParamsValues("filter_by", {
    productId: [] as string[],
    operatore: [] as string[],
    state: [] as string[],
  } as Filter)

  const filterableColumns = React.useMemo(
    () =>
      allColumns
        .filter((c) => c.getCanFilter())
        .map((c) => ({
          id: c.id,
          label: c.columnDef.header,
          // @ts-expect-error accessorKey is not in the type
          value: c.columnDef.accessorKey as string,
          filterValues:
            // @ts-expect-error filterValues is not in the type
            c.columnDef.meta?.filterValues as string[] | undefined,
        })),
    [allColumns]
  )

  console.log(filterableColumns)

  const [searchBy] =
    React.useState<SearchBy<{ praticaId: string }>>("praticaId")

  const form = useForm<FormData>({
    defaultValues: {
      id: searchParams.get("q") ?? "",
    },
    resolver: zodResolver(schema),
    mode: "all",
  })

  const handleSubmit = form.handleSubmit((data) => {
    const url = new URL(window.location.href)
    if (data.id === "") {
      url.searchParams.delete("q")
      url.searchParams.delete("search_by")
    } else {
      url.searchParams.set("q", data.id)
      url.searchParams.set("search_by", searchBy)
    }

    router.push(url.toString())
  })

  const resetSearchParams = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("q")
    url.searchParams.delete("search_by")
    form.setValue("id", "")
    router.push(url.toString())
  }, [router, form])

  const handleSelectChange = useCallback(
    (value: string, columnId: string) => {
      handleFilterUrlChange(value, columnId)
    },
    [handleFilterUrlChange]
  )

  return (
    <div className="sticky left-0 top-0 z-10 flex w-full flex-col gap-2 border-b border-neutral-200 bg-card p-4">
      <div className="flex w-full items-center gap-2">
        <div className="flex w-full flex-col gap-2">
          <Form {...form}>
            <form
              className="flex w-full items-center gap-2"
              onSubmit={handleSubmit}
            >
              <FormField
                name="id"
                control={form.control}
                render={({ field }) => {
                  return (
                    <FormItem className="w-full max-w-sm">
                      <Input
                        placeholder={`Cerca Pratica ID`}
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
          {form.getValues().id ? (
            <Badge
              className="badge-with-close w-fit"
              variant="secondary"
              onClick={resetSearchParams}
            >
              <div className="flex w-fit items-center">
                {searchBy}: {form.getValues().id}
                <span
                  data-close
                  className="badge-close-icon ml-2 flex items-center justify-center"
                >
                  <X size={16} />
                </span>
              </div>
            </Badge>
          ) : null}
        </div>

        <div className="ml-auto flex w-full items-center justify-end">
          <div className="ml-4">
            <PopoverDateFilter filterMap={PRATICA_FILTER_MAP} />
          </div>
          {filterableColumns.map((column) => (
            <div key={column.id} className="ml-4">
              <Select
                onValueChange={(value) =>
                  handleSelectChange(value, column.value)
                }
              >
                <SelectTrigger value={column.id}>
                  <label>{column.label?.toString()} </label>
                  {/* <SelectValue placeholder={column.label?.toString()} /> */}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{column.label?.toString()}</SelectLabel>
                    {column.filterValues
                      ?.filter(
                        (item) =>
                          !filters[column.id as FilterKeys]
                            ?.flat()
                            .includes(item)
                      )
                      ?.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    <SelectItem value="all">Tutti</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="ml-4">
            <FileCombobox
              table="practices"
              onValueChange={(value) => handleSelectChange(value, "file")}
            />
          </div>
          <div className="ml-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  Colonne
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {allColumns
                  .filter((column) => column.getCanHide())
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
      </div>
      <div className="flex w-full flex-wrap gap-2">
        <DismissableFilterBadges
          arrayFilters={arrayFilters}
          removeFilterSingleFilter={removeFilterSingleFilter}
        />
      </div>
    </div>
  )
}
