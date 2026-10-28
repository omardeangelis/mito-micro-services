import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useActiveImport, useInvalidateImports } from "@/api/import"
import { useToast } from "@/components/ui/use-toast"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { endingNotice } from "./_components/format"

// The end of an import, in any page of the dashboard (T19, D15), as
// `ImportStatusProvider` of the Next.js app: while the admin's latest import
// runs, `GET /import/active` is asked again every 3 seconds; when it ends, the
// notice says how, and the lists show the new data (AC21, AC26). Operators
// never ask, and nobody polls without an import running. The toast is
// announced by its own live region (Radix), so there is no other

const ImportStatusContext = createContext<{
  /** Follows an import from its start, even one that ends before the next ask */
  watch: (runId: number) => void
} | null>(null)

export function ImportStatusProvider({ children }: PropsWithChildren) {
  const isAdmin = useUserPreferenceContext((state) => state.role) === "ADMIN"
  const invalidate = useInvalidateImports()
  const { toast } = useToast()
  const { data } = useActiveImport(isAdmin)
  // The import being followed: the one seen running, or the one just started
  const watched = useRef<number | undefined>(undefined)

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
    void invalidate.lists()
    // Only a completed import wrote something: customers, practices, the
    // home and the "File" filter
    if (data.status === "completed") void invalidate.written()
  }, [data, toast, invalidate])

  const watch = useCallback(
    (runId: number) => {
      watched.current = runId
      void invalidate.active()
    },
    [invalidate]
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
