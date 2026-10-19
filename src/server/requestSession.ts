import { AsyncLocalStorage } from "node:async_hooks"
import { type Session } from "next-auth"

/**
 * The session of the request the backend (`api/`) is serving. The backend
 * reads it from the NextAuth cookie and runs the request inside it, so
 * `getServerAuthSession` returns it there without Next.js. Inside Next.js
 * nothing sets it, and NextAuth reads the session as before.
 */
export const requestSession = new AsyncLocalStorage<{
  session: Session | null
}>()
