import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { once } from "node:events"
import { type AddressInfo } from "node:net"
import { serve, type ServerType } from "@hono/node-server"
import { createTRPCProxyClient, TRPCClientError } from "@trpc/client"
import { type AppRouter } from "@mito/server/api/root"
import { migrateUpTo, resetDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../../../apps/api/src/app"
import { backendLink } from "../backendLink"
import { transformer } from "../shared"

// The real session read: better-auth of the app, on the backend
vi.unmock("@mito/server/auth")

// The backend of api/ on a real port, as Cloud Run serves it
let server: ServerType
let backendUrl: string

/** `api` of `@/trpc/server` with BACKEND_URL, rendering a request with this cookie. */
const serverApi = (cookie: string | null) =>
  createTRPCProxyClient<AppRouter>({
    transformer,
    links: [backendLink({ url: backendUrl, cookie: () => cookie })],
  })

beforeAll(async () => {
  await migrateUpTo()
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" })
  await once(server, "listening")
  backendUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe("backendLink", () => {
  it("esegue la procedura sul backend come l'utente del cookie della richiesta", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const { cookie } = await signIn(operator.userId)

    const preference = await serverApi(
      `other=1; ${cookie}`
    ).user.getUserPreference.query()

    expect(preference).toMatchObject({
      role: "ADMIN",
      operatorId: operator.id,
    })
  })

  it("senza sessione il backend risponde UNAUTHORIZED, come la chiamata diretta", async () => {
    const error = await serverApi(null)
      .user.getUserPreference.query()
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(TRPCClientError)
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe(
      "UNAUTHORIZED"
    )
  })

  it("chiede a Next.js di non mettere in cache la risposta, che è di un solo utente", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await serverApi(null)
      .user.getUserPreference.query()
      .catch(() => undefined)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toMatch(
      new RegExp(`^${backendUrl}/api/trpc/user\\.getUserPreference\\?`)
    )
    expect(init).toMatchObject({ cache: "no-store" })
  })

  it("al backend manda il cookie della richiesta e dice che la chiamata viene dal server", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await serverApi("better-auth.session_token=abc")
      .user.getUserPreference.query()
      .catch(() => undefined)

    const headers = new Headers(fetchSpy.mock.calls[0]![1]?.headers)
    expect(headers.get("cookie")).toBe("better-auth.session_token=abc")
    expect(headers.get("x-trpc-source")).toBe("rsc")
  })
})
