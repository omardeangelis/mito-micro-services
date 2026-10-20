import { TRPCClientError, type TRPCLink } from "@trpc/client"
import { callProcedure } from "@trpc/server"
import { observable } from "@trpc/server/observable"
import { type TRPCErrorResponse } from "@trpc/server/rpc"

import { appRouter, type AppRouter } from "@/server/api/root"
import { type createTRPCContext } from "@/server/api/trpc"

/**
 * A link that invokes the procedures as functions, without HTTP: the server
 * components of Next.js and, in the backend (api/), the route handlers it
 * hosts. Each side gives it its own context.
 */
export const inProcessLink =
  (
    createContext: () => ReturnType<typeof createTRPCContext>
  ): TRPCLink<AppRouter> =>
  () =>
  ({ op }) =>
    observable((observer) => {
      createContext()
        .then((ctx) => {
          return callProcedure({
            procedures: appRouter._def.procedures,
            path: op.path,
            rawInput: op.input,
            ctx,
            type: op.type,
          })
        })
        .then((data) => {
          observer.next({ result: { data } })
          observer.complete()
        })
        .catch((cause: TRPCErrorResponse) => {
          observer.error(TRPCClientError.from(cause))
        })
    })
