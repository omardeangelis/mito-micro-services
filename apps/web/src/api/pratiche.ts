import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Effect } from "effect"
import { type NewPratica } from "@mito/contract/pratiche"
import { useRun } from "./ApiProvider"
import { customerKeys } from "./customer"
import { ApiClient } from "./runtime"

/** The keys of the group `pratiche`: `[group, endpoint, input]` (H12) */
export const praticheKeys = {
  all: ["pratiche"] as const,
  regions: () => [...praticheKeys.all, "getAllAvailableRegion"] as const,
}

/** The regions of the practices (`GET /pratiche/regions`) */
export const useRegions = () => {
  const run = useRun()
  return useQuery({
    queryKey: praticheKeys.regions(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.getAllAvailableRegion()
        }),
        signal
      ),
  })
}

/**
 * "Nuova pratica" (`POST /pratiche`): the practice, its holder and the new
 * customers. Then the customers and the practices are read again (§6)
 */
export const useCreatePratica = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NewPratica) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.createPratica({ payload })
        })
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.all }),
        queryClient.invalidateQueries({ queryKey: praticheKeys.all }),
      ]),
  })
}
