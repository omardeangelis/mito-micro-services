import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { useCustomersUnderReview } from "@/api/customer"
import { TablePagination } from "@/components/custom/table/TablePagination"
import { useSearchParams } from "@/lib/navigation"
import { BlacklistTable } from "./_components/BlacklistTable"
import {
  AdminOnly,
  SettingsLoading,
  SettingsPage,
} from "./_components/SettingsPage"

/** A positive integer of the address, or `fallback` */
const integer = (value: string | null, fallback: number) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 ? number : fallback
}

/**
 * Blacklist, in the settings (admins only): the customers flagged for a
 * check and those blacklisted, a page at a time, with how many of each
 */
export function Component() {
  return (
    <AdminOnly>
      <Blacklist />
    </AdminOnly>
  )
}

const Blacklist = () => {
  // The page of the address, that `TablePagination` writes
  const params = useSearchParams()
  const { data } = useCustomersUnderReview({
    page: integer(params.get("page"), DEFAULT_PAGE),
    perPage: integer(params.get("per_page"), DEFAULT_PER_PAGE),
  })
  return (
    <SettingsPage
      wide
      title="Blacklist"
      description="I clienti segnalati da verificare e quelli in blacklist. Con DM acceso il cliente è in blacklist; spento, torna un cliente normale ed esce dalla lista."
      aside={
        data && data.total > 0 ? (
          <span className="text-sm text-muted-foreground">
            {`${data.total - data.blacklisted} da verificare · ${data.blacklisted} in blacklist`}
          </span>
        ) : null
      }
    >
      {data === undefined ? (
        <SettingsLoading />
      ) : (
        <>
          <BlacklistTable customers={data.customers} />
          {data.total > 0 ? <TablePagination itemCount={data.total} /> : null}
        </>
      )}
    </SettingsPage>
  )
}
