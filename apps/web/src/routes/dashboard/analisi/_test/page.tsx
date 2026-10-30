import { Layer } from "effect"
import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished, vi } from "vitest"
import { type Authenticated } from "@mito/contract/middleware"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ada, fakeMe, renderWithApi, signedInAs } from "@/test/api"
import { type fakeAnalisi } from "@/test/analisi"
import { Component as AnalisiPage } from "../AnalisiPage"

/** 30 October 2026, 12:00 in Rome: the day of the examples of the spec */
export const NOW = new Date("2026-10-30T11:00:00.000Z")

/**
 * Renders the analysis page at `path`, on the history of the browser, so
 * `window.location` follows its writes as in the app: another address shows
 * "altra pagina", an error of the route "errore della rotta". The signed-in
 * operator is Ada (7): `GET /me` says `role` (`me`, which the test can
 * change), and the preferences follow it as in the app; the endpoints answer
 * as `serverRole`, `role` unless given (a role changed on the server). The
 * clock is at `NOW`
 */
export function renderAnalisi(
  path: string,
  backend: ReturnType<typeof fakeAnalisi>,
  options: {
    role?: Role
    serverRole?: Role
    /** The middleware of the fake backend, instead of Ada signed in as `serverRole` (an expired session) */
    auth?: Layer.Layer<Authenticated>
  } = {}
) {
  const role = options.role ?? "OPERATORE"
  const me = fakeMe({ operator: ada, role })
  // jsdom measures nothing, and the observer of test/setup.ts never calls
  // back: this one gives every chart a size as soon as it observes it, as in
  // components/charts/_test
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 720, height: 320 },
            } as unknown as ResizeObserverEntry,
          ],
          this
        )
      }
      unobserve = () => undefined
      disconnect = () => undefined
    }
  )
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard/analisi",
      element: <AnalisiPage />,
      errorElement: <p>errore della rotta</p>,
    },
    { path: "*", element: <p>altra pagina</p> },
  ])
  onTestFinished(() => {
    router.dispose()
    window.history.replaceState(null, "", "/")
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  return {
    router,
    me,
    ...renderWithApi(
      <UserPreferenceProvider>
        <RouterProvider router={router} />
      </UserPreferenceProvider>,
      {
        handlers: Layer.mergeAll(backend.handlers, me.handlers),
        auth: options.auth ?? signedInAs(ada, options.serverRole ?? role),
      }
    ),
  }
}
