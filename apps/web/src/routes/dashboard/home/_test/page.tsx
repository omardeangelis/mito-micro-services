import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakeHome } from "@/test/home"
import { Component as HomePage } from "../HomePage"

/**
 * Renders the home at `path`, on the history of the browser, so
 * `window.location` follows the navigations as in the app: the other
 * addresses show "altra pagina", an error of a route "errore della rotta".
 * The signed-in operator is Ada (7)
 */
export function renderHome(
  path: string,
  backend: ReturnType<typeof fakeHome>,
  { role = "OPERATORE" }: { role?: Role } = {}
) {
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard",
      errorElement: <p>errore della rotta</p>,
      children: [{ index: true, element: <HomePage /> }],
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
      { handlers: backend.handlers, auth: signedInAs(ada, role) }
    ),
  }
}
