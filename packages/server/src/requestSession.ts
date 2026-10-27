import { AsyncLocalStorage } from "node:async_hooks"
import { type Session } from "./betterAuth/session"

/**
 * The session of the request the backend (`api/`) is serving. The backend
 * reads it once from better-auth's cookie and runs the request inside it, so
 * `getServerAuthSession` returns it there, also to the route handlers that
 * call the procedures in-process (apps/api/src/shims/trpcServer.ts), which
 * have no request to read it from. Inside Next.js nothing sets it.
 */
export const requestSession = new AsyncLocalStorage<{
  session: Session | null
}>()
