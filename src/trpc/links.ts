import {
  type TRPCLink,
  httpLink,
  loggerLink,
  splitLink,
  unstable_httpBatchStreamLink,
} from "@trpc/client"
import { type AppRouter } from "@mito/server/api/root"
import { getUrl } from "./shared"

// The links of the browser's tRPC client. The calls of the import (D12) go
// one per request, so that its parts never add up in one body, and the logger
// leaves them out: their inputs and errors could hold the rows of the file, and
// nothing of them belongs in the console (AC31)

/** A call of the import's procedures. */
export const isImportCall = (op: { path: string }) =>
  op.path.startsWith("import.")

/**
 * What the logger writes: everything in development, else failures, never the
 * import. The link passes the whole operation both ways, but tRPC's types
 * leave the path out of the answer: without one, nothing is written.
 */
export const shouldLog = (op: {
  path?: string
  direction: "up" | "down"
  result?: unknown
}) =>
  op.path !== undefined &&
  !isImportCall({ path: op.path }) &&
  (process.env.NODE_ENV === "development" ||
    (op.direction === "down" && op.result instanceof Error))

export const browserLinks = (): TRPCLink<AppRouter>[] => [
  loggerLink({ enabled: shouldLog }),
  splitLink({
    condition: isImportCall,
    true: httpLink({ url: getUrl() }),
    false: unstable_httpBatchStreamLink({ url: getUrl() }),
  }),
]
