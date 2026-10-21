import { httpBatchLink } from "@trpc/client"

import { type AppRouter } from "@/server/api/root"

/**
 * The link of `@/trpc/server` when the backend on Cloud Run serves the API
 * (BACKEND_URL): the server components and actions call it over HTTP, with
 * the cookie of the request they are rendering, so the backend reads the same
 * session as for the browser's calls.
 */
export const backendLink = ({
  url,
  cookie,
}: {
  url: string
  cookie: () => Promise<string | null>
}) =>
  httpBatchLink<AppRouter>({
    url: new URL("/api/trpc", url).href,
    headers: async () => {
      const value = await cookie()
      return { "x-trpc-source": "rsc", ...(value ? { cookie: value } : {}) }
    },
    // Next.js caches the fetch of a server component unless told otherwise:
    // one user's answer would be served to the next
    fetch: (input, init) =>
      fetch(input, { ...(init as RequestInit), cache: "no-store" }),
  })
