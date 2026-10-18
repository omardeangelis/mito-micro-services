import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { Hono } from "hono"
import { appRouter } from "@/server/api/root"
import { createTRPCContext } from "@/server/api/trpc"
import { requestSession } from "@/server/requestSession"
import { sessionFromRequest } from "./session"

/**
 * The backend: the same tRPC router the Next.js app serves at /api/trpc, on
 * the same path, so a Vercel rewrite can send the browser's calls here
 * unchanged. Every /api request runs inside its session (`requestSession`):
 * the code that calls `getServerAuthSession` gets it as in Next.js.
 */
export const app = new Hono()

app.get("/health", (c) => c.json({ ok: true }))

app.use("/api/*", async (c, next) => {
  const session = await sessionFromRequest(c.req.raw)
  await requestSession.run({ session }, next)
})

app.all("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: c.req.raw.headers }),
    onError: ({ path, error }) => {
      // Client errors (UNAUTHORIZED, BAD_REQUEST, …) are the caller's
      if (error.code !== "INTERNAL_SERVER_ERROR") return
      console.error(`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`)
    },
  })
)
