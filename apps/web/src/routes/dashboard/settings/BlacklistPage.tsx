import { useCustomersUnderReview } from "@/api/customer"
import { BlacklistTable } from "./_components/BlacklistTable"
import {
  AdminOnly,
  SettingsLoading,
  SettingsPage,
} from "./_components/SettingsPage"

/**
 * Blacklist, in the settings (admins only): the customers flagged for a
 * check and those blacklisted, with how many of each
 */
export function Component() {
  return (
    <AdminOnly>
      <Blacklist />
    </AdminOnly>
  )
}

const Blacklist = () => {
  const { data } = useCustomersUnderReview()
  const blacklisted =
    data?.filter((customer) => customer.blackListStatus === "blacklisted")
      .length ?? 0
  return (
    <SettingsPage
      wide
      title="Blacklist"
      description="I clienti segnalati da verificare e quelli in blacklist. Con DM acceso il cliente è in blacklist; spento, torna un cliente normale ed esce dalla lista."
      aside={
        data && data.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {`${data.length - blacklisted} da verificare · ${blacklisted} in blacklist`}
          </span>
        ) : null
      }
    >
      {data === undefined ? (
        <SettingsLoading />
      ) : (
        <BlacklistTable customers={data} />
      )}
    </SettingsPage>
  )
}
