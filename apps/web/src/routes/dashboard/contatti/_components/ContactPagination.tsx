import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PER_PAGES } from "@mito/domain/constants/pagination"
import { listHref } from "../_lib/listHref"
import {
  withFilterChange,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useContactsNavigation } from "./ContactsListShell"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"

type Props = {
  state: ContactsListState
  total: number
}

/**
 * The pages of the list. Everything comes from the address (`state`) and the
 * total: no page is kept here, and nothing navigates but a click.
 */
export function ContactPagination({ state, total }: Props) {
  const { navigateWith } = useContactsNavigation()
  const { page, perPage } = state

  // Past the last page there is no range to show, and the page before is the
  // last one that exists
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const beyond = page > lastPage
  const from = beyond ? 0 : Math.min((page - 1) * perPage + 1, total)
  const to = beyond ? 0 : Math.min(page * perPage, total)
  const previousPage = Math.min(page - 1, lastPage)
  const nextPage = page + 1
  const previousHref =
    page > 1 ? listHref({ ...state, page: previousPage }) : null
  const nextHref =
    page * perPage < total ? listHref({ ...state, page: nextPage }) : null

  // The page asked for, over the filters the list is heading to: a search
  // typed and not sent yet goes along (M6)
  const goToPage = (target: number) => () => {
    navigateWith(state, (base) => ({ ...base, page: target }))
  }

  return (
    <div className="flex w-full flex-row items-center justify-between gap-4">
      <Pagination
        aria-label="Paginazione"
        className="mx-0 flex w-auto justify-start"
      >
        <PaginationContent className="mx-0 justify-start">
          {previousHref !== null ? (
            <PaginationItem>
              <PaginationLink
                href={previousHref}
                size="default"
                aria-label="Pagina precedente"
                className="gap-1 pl-2.5"
                onClick={navigateOnPlainClick(
                  goToPage(previousPage),
                  previousHref
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Precedente</span>
              </PaginationLink>
            </PaginationItem>
          ) : null}
          {nextHref !== null ? (
            <PaginationItem>
              <PaginationLink
                href={nextHref}
                size="default"
                aria-label="Pagina successiva"
                className="gap-1 pr-2.5"
                onClick={navigateOnPlainClick(goToPage(nextPage), nextHref)}
              >
                <span>Successiva</span>
                <ChevronRight className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
          ) : null}
        </PaginationContent>
      </Pagination>
      <div className="flex flex-row items-center">
        <p className="mr-1 w-full min-w-36 text-gray-600">
          {`${from} - ${to} di ${total}`}
        </p>
        <Select
          value={String(perPage)}
          onValueChange={(value) =>
            navigateWith(state, (base) =>
              withFilterChange(base, { perPage: Number(value) })
            )
          }
        >
          <SelectTrigger aria-label="Righe per pagina">
            <SelectValue>{perPage}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PER_PAGES.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
