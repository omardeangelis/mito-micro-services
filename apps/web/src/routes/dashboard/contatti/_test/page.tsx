import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createBrowserRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import {
  createUserPreferenceStore,
  type UserPreferenceInitProps,
} from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakeContacts } from "@/test/contacts"
import { Component as ContactPage } from "../ContactPage"
import { ContactsError } from "../ContactsError"
import { Component as ContactsPage } from "../ContactsPage"

/**
 * Renders the contacts at `path`, on the history of the browser, so
 * `window.location` follows the navigations as in the app: the list, the
 * detail of a contact (with `detail`; otherwise it shows "dettaglio"), the
 * other addresses as "altra pagina", an error of the route `ContactsError`,
 * as in the app. The
 * signed-in user is Ada, with `role`; with `role: null` the store doesn't
 * know them yet
 */
export function renderContacts(
  path: string,
  backend: ReturnType<typeof fakeContacts>,
  {
    role = "OPERATORE",
    preferences,
    detail = false,
  }: {
    role?: Role | null
    preferences?: UserPreferenceInitProps["preferences"]
    detail?: boolean
  } = {}
) {
  window.history.replaceState(null, "", path)
  const router = createBrowserRouter([
    {
      path: "/dashboard/contatti",
      errorElement: <ContactsError />,
      children: [
        { index: true, element: <ContactsPage /> },
        {
          path: ":id",
          element: detail ? <ContactPage /> : <p>dettaglio</p>,
        },
      ],
    },
    { path: "*", element: <p>altra pagina</p> },
  ])
  const store = createUserPreferenceStore(
    role === null ? { preferences } : { role, operatorId: ada.id, preferences }
  )
  // Every navigation of the router, as "PUSH /dashboard/contatti?…"
  const navigations: string[] = []
  let lastKey = router.state.location.key
  const unsubscribe = router.subscribe((state) => {
    if (state.location.key === lastKey) return
    lastKey = state.location.key
    const { pathname, search } = state.location
    navigations.push(`${state.historyAction} ${pathname}${search}`)
  })
  onTestFinished(() => {
    unsubscribe()
    router.dispose()
    window.history.replaceState(null, "", "/")
  })
  const user = userEvent.setup()
  return {
    user,
    router,
    navigations,
    store,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <RouterProvider router={router} />
      </UserPreferenceContext>,
      { handlers: backend.handlers, auth: signedInAs(ada, role ?? "OPERATORE") }
    ),
  }
}

/** The search params of the address the page is on */
export const currentParams = () => new URLSearchParams(window.location.search)

/** The address the page is on, path and query */
export const currentHref = () =>
  `${window.location.pathname}${window.location.search}`

/** Waits for the table of the list */
export const findTable = () => screen.findByRole("table", { name: "Contatti" })
