import { unstable_noStore as noStore } from "next/cache"
import { Suspense } from "react"

import { type ServerPageDefaultProps } from "@/lib/types"
import { ContactTableLoading } from "./_components/ContactTableLoading"
import { ContactsTableSection } from "./_components/ContactsTableSection"

export const maxDuration = 60

export default async function ContactsHome(
  props: Pick<ServerPageDefaultProps, "searchParams">
) {
  const searchParams = await props.searchParams
  noStore()

  return (
    // `scroll-pb-16`: the bar of the pagination is `sticky bottom-0` and would
    // cover a focused control that is scrolled to the bottom edge (2.4.11)
    <div className="dashbaord-layout scroll-pb-16">
      <Suspense fallback={<ContactTableLoading />}>
        <ContactsTableSection searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
