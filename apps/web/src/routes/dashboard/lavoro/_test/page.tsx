import userEvent from "@testing-library/user-event"
import { Layer } from "effect"
import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import {
  UserPreferenceContext,
  UserPreferenceProvider,
} from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi } from "@/test/api"
import { type fakeHome } from "@/test/home"
import { type fakeLavoro } from "@/test/lavoro"
import { Component as HomePage } from "../../home/HomePage"
import { Component as LavoroPage } from "../LavoroPage"

/**
 * Renders the view at `path` (`/dashboard` or `/dashboard/lavoro`), on the
 * history of the browser: the other addresses show "altra pagina", an error
 * of a route "errore della rotta". With `role: undefined` the store doesn't
 * know the role, as when `GET /me` failed. `alsoServe` adds the groups of
 * another fake backend, for a page that isn't the view. With `realProvider`
 * the role comes from `GET /me` through `UserPreferenceProvider`, as in the app
 */
export function renderLavoro(
  path: string,
  backend: ReturnType<typeof fakeLavoro>,
  options: {
    role?: Role | undefined
    alsoServe?: ReturnType<typeof fakeHome>["handlers"]
    realProvider?: boolean
  } = {}
) {
  const role = "role" in options ? options.role : "OPERATORE"
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard",
      errorElement: <p>errore della rotta</p>,
      children: [
        { index: true, element: <HomePage /> },
        { path: "lavoro", element: <LavoroPage /> },
      ],
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
    user: userEvent.setup(),
    ...renderWithApi(
      options.realProvider ? (
        <UserPreferenceProvider>
          <RouterProvider router={router} />
        </UserPreferenceProvider>
      ) : (
        <UserPreferenceContext value={store}>
          <RouterProvider router={router} />
        </UserPreferenceContext>
      ),
      {
        handlers: options.alsoServe
          ? Layer.merge(backend.handlers, options.alsoServe)
          : backend.handlers,
        auth: backend.auth,
      }
    ),
  }
}
