import "server-only"

import { createTRPCProxyClient, loggerLink } from "@trpc/client"
import { headers } from "next/headers"
import { cache } from "react"

import { env } from "@mito/env"
import { type AppRouter } from "@mito/server/api/root"
import { createTRPCContext } from "@mito/server/api/trpc"
import { backendLink } from "./backendLink"
import { inProcessLink } from "./inProcessLink"
import { transformer } from "./shared"

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = cache(() => {
  const heads = new Headers(headers())
  heads.set("x-trpc-source", "rsc")

  return createTRPCContext({
    headers: heads,
  })
})

/**
 * Custom RSC link that lets us invoke procedures without using http requests. Since Server
 * Components always run on the server, we can just call the procedure as a function.
 */
const rscLink = inProcessLink(createContext)

export const api = createTRPCProxyClient<AppRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) =>
        process.env.NODE_ENV === "development" ||
        (op.direction === "down" && op.result instanceof Error),
    }),
    // With the backend on Cloud Run, the procedures run there, over HTTP
    env.BACKEND_URL
      ? backendLink({
          url: env.BACKEND_URL,
          cookie: () => headers().get("cookie"),
        })
      : rscLink,
  ],
})
