import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select"
import { useRouter } from "@/lib/navigation"
import React, { useEffect } from "react"
import { useSearchParams } from "@/lib/navigation"
import { DEFAULT_PER_PAGE, PER_PAGES } from "@mito/domain/constants/pagination"

export const TablePagination = ({ itemCount }: { itemCount: number }) => {
  const searchParams = useSearchParams()

  const [page, setPage] = React.useState(() => {
    // Number() is never nullish: a missing page is 0, so 1 below
    const page = Number(searchParams.get("page"))
    return page > 0 ? page : 1
  })
  const [perPage, setPerPage] = React.useState(() => {
    const perPage = Number(searchParams.get("per_page"))
    return perPage > 0 ? perPage : DEFAULT_PER_PAGE
  })
  const router = useRouter()
  const lastPage =
    Math.ceil(itemCount / perPage - 1) > 0
      ? Math.ceil(itemCount / perPage - 1)
      : 0
  const addPageAndPerPageToUrl = React.useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set("page", page.toString())
    url.searchParams.set("per_page", perPage.toString())
    router.push(url.toString())
  }, [router, page, perPage])

  useEffect(() => {
    addPageAndPerPageToUrl()
  }, [addPageAndPerPageToUrl])

  React.useEffect(() => {
    if (page > lastPage) {
      setPage(lastPage + 1)
    }
  }, [lastPage, page])

  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <Pagination className="mx-0 flex w-auto justify-start">
        <PaginationContent className="mx-0 justify-start">
          {page > 1 ? (
            <PaginationPrevious
              href="#"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault()
                if (page > 1) {
                  setPage(page - 1)
                }
              }}
            />
          ) : null}
          {page - 1 >= lastPage ? null : (
            <PaginationNext
              href="#"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault()
                if (page - 1 < Math.floor(itemCount / perPage)) {
                  setPage(page + 1)
                }
              }}
            />
          )}
        </PaginationContent>
      </Pagination>
      <div className="flex flex-row items-center">
        <p className="mr-1 w-full min-w-36 text-muted-foreground">
          {itemCount === 0
            ? "0 - 0"
            : `${
                page * perPage - perPage + 1
              } - ${page * perPage} of ${itemCount}`}
        </p>
        <Select
          defaultValue={perPage.toString()}
          onValueChange={(e) => setPerPage(Number(e))}
        >
          <SelectTrigger>
            <SelectValue>{perPage}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PER_PAGES.map((perPage) => (
                <SelectItem key={perPage} value={perPage.toString()}>
                  {perPage}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
