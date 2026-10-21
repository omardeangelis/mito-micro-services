import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { Hono } from "hono"
import { appRouter } from "@mito/server/api/root"
import { createTRPCContext } from "@mito/server/api/trpc"
import { requestSession } from "@mito/server/requestSession"
import { GET as authUser } from "@/app/api/auth/user/route"
import { authRoute } from "./auth"
import { restRoutes } from "./rest"
import { cronLive } from "./cron/live"
import { cronRoutes } from "./cron/routes"
import { sessionFromRequest } from "./session"

/**
 * The backend: the same tRPC router the Next.js app serves at /api/trpc, on
 * the same path, so a Vercel rewrite can send the browser's calls here
 * unchanged. Every /api request runs inside its session (`requestSession`):
 * the code that calls `getServerAuthSession` gets it as in Next.js.
 */
export const app = new Hono()

app.get("/health", (c) => c.json({ ok: true }))

// Cloud Scheduler's calls, with its OIDC token: outside /api, so no Vercel
// rewrite reaches them and they read no session
app.route("/internal/cron", cronRoutes(cronLive(process.env)))

app.use("/api/*", async (c, next) => {
  const session = await sessionFromRequest(c.req.raw)
  await requestSession.run({ session }, next)
})

// The route of the Next.js app answers nothing without a session, and Next.js
// turns that into a 500
app.all(
  "/api/auth/user",
  async () => (await authUser()) ?? new Response(null, { status: 500 })
)

app.all("/api/auth/*", (c) => authRoute(c.req.raw))

app.route("/", restRoutes())

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
