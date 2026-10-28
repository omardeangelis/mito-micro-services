import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/api/customer"
import { taskKeys } from "@/api/task"

/**
 * In place of `router.refresh()` of the Next.js app: the customers and the
 * contacts are read again, and `refreshing` stays true until they are, so it
 * says when the saved value is on screen. The wait of a save lasts from the
 * call to that moment.
 */
export const useRefreshAfterSave = () => {
  const queryClient = useQueryClient()
  // "done" lasts one render: a refresh that ends at once, in the same batch
  // of updates as its start, still shows `refreshing` true and then false
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")
  useEffect(() => {
    if (phase === "done") setPhase("idle")
  }, [phase])
  const refresh = useCallback(() => {
    setPhase("running")
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
      queryClient.invalidateQueries({ queryKey: taskKeys.all }),
    ]).finally(() => setPhase("done"))
  }, [queryClient])
  return { refresh, refreshing: phase !== "idle" }
}
