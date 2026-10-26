"use client"

import { useRouter } from "next/navigation"
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useToast } from "@/components/ui/use-toast"
import { endingNotice } from "@/app/dashboard/import/_components/format"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { api } from "@/trpc/react"

// The end of an import, in any page of the dashboard (T19, D15): while the
// admin's latest import runs, `import.active` is asked again every 3 seconds;
// when it ends, the notice says how, and the lists show the new data (AC21,
// AC26). Operators never ask, and nobody polls without an import running.
// The toast is announced by its own live region (Radix), so there is no other

const POLL_MS = 3000

const ImportStatusContext = createContext<{
  /** Follows an import from its start, even one that ends before the next ask */
  watch: (runId: number) => void
} | null>(null)

export function ImportStatusProvider({ children }: PropsWithChildren) {
  const isAdmin = useUserPreferenceContext((state) => state.role) === "ADMIN"
  const utils = api.useUtils()
  const router = useRouter()
  const { toast } = useToast()
  const running = (data: { status: string } | null | undefined) =>
    data?.status === "running"
  const { data } = api.import.active.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: (data) => (running(data) ? POLL_MS : false),
    refetchOnWindowFocus: (query) => running(query.state.data),
  })
  // The import being followed: the one seen running, or the one just started
  const watched = useRef<number>()

  useEffect(() => {
    if (!data) return
    if (data.status === "running") {
      watched.current = data.id
      return
    }
    if (watched.current !== data.id) return
    watched.current = undefined
    const notice = endingNotice(data)
    if (notice) toast({ ...notice, duration: 10_000 })
    void utils.import.list.invalidate()
    // Only a completed import wrote something: Clienti, Pratiche, "Ultime
    // Pratiche Aggiornate" (server) and the "File" filter (client)
    if (data.status === "completed") {
      router.refresh()
      void utils.customer.getAllFileName.invalidate()
    }
  }, [data, router, toast, utils])

  const watch = useCallback(
    (runId: number) => {
      watched.current = runId
      void utils.import.active.invalidate()
    },
    [utils]
  )
  const value = useMemo(() => ({ watch }), [watch])
  return (
    <ImportStatusContext.Provider value={value}>
      {children}
    </ImportStatusContext.Provider>
  )
}

export const useImportStatus = () => {
  const context = useContext(ImportStatusContext)
  if (!context) {
    throw new Error(
      "useImportStatus must be used within an ImportStatusProvider"
    )
  }
  return context
}
