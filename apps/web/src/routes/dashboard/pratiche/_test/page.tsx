import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import {
  createUserPreferenceStore,
  type UserPreferenceInitProps,
} from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakePratiche } from "@/test/pratiche"
import { Component as PracticePage } from "../PracticePage"
import { Component as PracticesPage } from "../PracticesPage"

/**
 * Renders the pages Pratiche at `path`, on the history of the browser, so
 * `window.location` follows the navigations as in the app: the list and the
 * detail are the real ones, the other addresses show "altra pagina", an error
 * of a route "errore della rotta". The signed-in operator is Ada (7)
 */
export function renderPratiche(
  path: string,
  backend: ReturnType<typeof fakePratiche>,
  {
    role = "ADMIN",
    preferences,
  }: {
    role?: Role
    preferences?: UserPreferenceInitProps["preferences"]
  } = {}
) {
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard/pratiche",
      errorElement: <p>errore della rotta</p>,
      children: [
        { index: true, element: <PracticesPage /> },
        { path: ":id", element: <PracticePage /> },
      ],
    },
    { path: "*", element: <p>altra pagina</p> },
  ])
  const store = createUserPreferenceStore({
    role,
    operatorId: ada.id,
    preferences,
  })
  onTestFinished(() => {
    router.dispose()
    window.history.replaceState(null, "", "/")
  })
  return {
    router,
    store,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <RouterProvider router={router} />
      </UserPreferenceContext>,
      { handlers: backend.handlers, auth: signedInAs(ada, role) }
    ),
  }
}

/** The search params of the address the page is on */
export const currentParams = () => new URLSearchParams(window.location.search)
