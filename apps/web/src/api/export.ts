import { useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { ApiClient } from "./runtime"

/** A period of the calls export: calendar days in Rome, `YYYY-MM-DD` */
type Period = { from: string; to: string }

/** The keys of the group `export`: `[group, endpoint, input]` (H12) */
export const exportKeys = {
  all: ["export"] as const,
  callStats: (period: Period) =>
    [...exportKeys.all, "callStats", period] as const,
}

/**
 * The calls of each operator in `period` (`GET /export/call-stats`), admins
 * only. The section shows a failure itself, with "Riprova": no toast
 */
export const useCallStats = (period: Period, options: { enabled: boolean }) => {
  const run = useRun()
  return useQuery({
    queryKey: exportKeys.callStats(period),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.export.callStats({ query: period })
        }),
        signal
      ),
    meta: { toastErrors: false },
    ...options,
  })
}
