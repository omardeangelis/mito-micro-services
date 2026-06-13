import { type ServerPageProps } from "@/lib/types"
import { CustomerSheet } from "./_components/CustomerSheet"
import { CustomerPraticaSection } from "./_components/CustomersPraticaSection"
import { Suspense } from "react"
import { CustomerFormSection } from "./_components/CustomerFormSection"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerChatSection } from "./_components/CustomerChatSection"
import { api } from "@/trpc/server"
import { CustomerActivities } from "./_components/CustomerActivities"
import { CustomerTaskManager } from "./_components/CustomerTaskManager"

export default async function CustomerHome({
  params,
  searchParams,
}: ServerPageProps<{
  id: string
}>) {
  const { id } = params
  const { limit } = searchParams ?? {}
  const customer = await api.customer.getCustomerById.query({ id: id })
  const customerTasks = await api.task.getActiveTask.query({ id: id })

  return (
    <CustomerSheet id={id} blackListStatus={customer!.blackListStatus}>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerFormSection {...customer!} />
      </Suspense>
      {customerTasks.length > 0 ? (
        <Suspense>
          <CustomerTaskManager tasks={customerTasks} />
        </Suspense>
      ) : null}
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-md" />}>
        <CustomerPraticaSection id={id} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerChatSection
          id={id}
          limit={limit ? Number(limit) : undefined}
        />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerActivities customer={{ id }} />
      </Suspense>
    </CustomerSheet>
  )
}
