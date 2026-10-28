import { type ReactNode } from "react"
import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import {
  createUserPreferenceStore,
  type UserPreferenceInitProps,
} from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakeCustomers } from "@/test/customers"
import { Component as CustomersPage } from "../CustomersPage"

/**
 * Renders `ui` at `/dashboard/customers` (the page itself by default), on the
 * history of the browser, so `window.location` follows the navigations as in
 * the app: the other addresses show "altra pagina", an error of the route
 * "errore della rotta". The preferences start from `preferences` and the
 * cookies, the role is the one of the store and of the backend
 */
export function renderCustomers(
  path: string,
  backend: ReturnType<typeof fakeCustomers>,
  {
    role = "ADMIN",
    preferences,
    ui = <CustomersPage />,
  }: {
    role?: Role
    preferences?: UserPreferenceInitProps["preferences"]
    ui?: ReactNode
  } = {}
) {
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard/customers",
      element: ui,
      errorElement: <p>errore della rotta</p>,
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
