// What the backend bundle loads in place of @/trpc/server (apps/api/build.mjs). The
// route handlers it hosts call the procedures through `api`; outside Next.js
// there is no request for next/headers, and the request's session is already
// the backend's (requestSession), so they run in-process with that context
import { createTRPCProxyClient, loggerLink } from "@trpc/client"
import { type AppRouter } from "@mito/server/api/root"
import { createTRPCContext } from "@mito/server/api/trpc"
import { inProcessLink } from "@/trpc/inProcessLink"
import { transformer } from "@/trpc/shared"

export const api = createTRPCProxyClient<AppRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) => op.direction === "down" && op.result instanceof Error,
    }),
    inProcessLink(() =>
      createTRPCContext({ headers: new Headers({ "x-trpc-source": "rsc" }) })
    ),
  ],
})
