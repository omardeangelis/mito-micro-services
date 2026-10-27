import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createContext, type PropsWithChildren, use, useMemo } from "react"
import { type ApiRuntime, appRuntime, makeRun, type Run } from "./runtime"

const RunContext = createContext<Run | null>(null)

/**
 * The backend and the cache of the app, for every page under it: the tests
 * pass a runtime on a fake backend (`renderWithApi`)
 */
export function ApiProvider({
  runtime = appRuntime,
  queryClient,
  children,
}: PropsWithChildren<{ runtime?: ApiRuntime; queryClient: QueryClient }>) {
  const run = useMemo(() => makeRun(runtime), [runtime])
  return (
    <RunContext value={run}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RunContext>
  )
}

/** The `run` of the `ApiProvider` above, for the modules of the groups */
export function useRun(): Run {
  const run = use(RunContext)
  if (run === null) throw new Error("useRun outside of ApiProvider")
  return run
}
