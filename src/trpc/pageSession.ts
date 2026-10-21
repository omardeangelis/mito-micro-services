import "server-only"

import { headers } from "next/headers"
import { env } from "@/env"
import { getServerAuthSession } from "@/server/auth"
import { backendSession } from "./backendSession"

/**
 * The session for a server component. With the backend on Cloud Run
 * (BACKEND_URL) it comes from there, like the procedures of `@/trpc/server`:
 * once the database moves, only the backend reads it.
 */
export const getPageSession = async () =>
  env.BACKEND_URL
    ? backendSession({
        url: env.BACKEND_URL,
        cookie: (await headers()).get("cookie"),
      })
    : getServerAuthSession()
