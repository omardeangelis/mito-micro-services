import { type ReactNode } from "react"
import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import {
  ada,
  type ApiGroups,
  type FakeHandlers,
  renderWithApi,
  signedInAs,
} from "@/test/api"
import { Component as HomePage } from "../HomePage"

/**
 * Renders the home at `path`, on the history of the browser, so
 * `window.location` follows the navigations as in the app: the other
 * addresses show "altra pagina", an error of a route "errore della rotta".
 * The signed-in operator is Ada (7). With `role: undefined` the page doesn't
 * know the role, as when `GET /me` failed: the fake backend doesn't serve it.
 * `page` draws something else at `/dashboard`
 */
export function renderHome<Groups extends ApiGroups>(
  path: string,
  backend: { handlers: FakeHandlers<Groups> },
  options: { role?: Role | undefined; page?: ReactNode } = {}
) {
  const role = "role" in options ? options.role : "OPERATORE"
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard",
      errorElement: <p>errore della rotta</p>,
      children: [{ index: true, element: options.page ?? <HomePage /> }],
    },
    { path: "*", element: <p>altra pagina</p> },
  ])
  const store = createUserPreferenceStore({ role, operatorId: ada.id })
  onTestFinished(() => {
    router.dispose()
    window.history.replaceState(null, "", "/")
  })
  return {
    router,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <RouterProvider router={router} />
      </UserPreferenceContext>,
      { handlers: backend.handlers, auth: signedInAs(ada, role ?? "OPERATORE") }
    ),
  }
}
