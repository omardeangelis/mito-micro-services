import { useCallback, useEffect, useState } from "react"
import { notifyManager, useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/api/customer"
import { taskKeys } from "@/api/task"

/**
 * In place of `router.refresh()` of the Next.js app: the customers and the
 * contacts are read again, and `refreshing` stays true until they are, so it
 * says when the saved value is on screen. The wait of a save lasts from the
 * call to that moment. A page that reads more once those answer (the detail
 * of a new contact) passes `then`, which reads it before the end
 */
export const useRefreshAfterSave = () => {
  const queryClient = useQueryClient()
  // "done" lasts one render: a refresh that ends at once, in the same batch
  // of updates as its start, still shows `refreshing` true and then false
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")
  useEffect(() => {
    if (phase === "done") setPhase("idle")
  }, [phase])
  const refresh = useCallback(
    (then?: () => Promise<unknown>) => {
      setPhase("running")
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
      ])
        .then(then)
        // A failed read shows its own error: the wait ends all the same
        .catch(() => undefined)
        // After the queries have told their observers, which TanStack Query
        // does in a later task: the page renders what was read first
        .finally(() => notifyManager.schedule(() => setPhase("done")))
    },
    [queryClient]
  )
  return { refresh, refreshing: phase !== "idle" }
}
