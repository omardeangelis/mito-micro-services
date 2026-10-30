import { createMemoryRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { renderWithApi, signedInAs } from "@/test/api"
import { type fakeProfile } from "@/test/profile"
import { Component as BlacklistPage } from "../BlacklistPage"
import { Component as MemberPage } from "../MemberPage"
import { Component as ProfilePage } from "../ProfilePage"
import { Component as TeamPage } from "../TeamPage"

/**
 * Renders the pages of the settings, from `path`, on the backend of the
 * test, signed in as its current user: an error of a route shows "errore
 * della rotta", /dashboard "la dashboard" and a customer "il cliente"
 */
export function renderSettings(
  backend: ReturnType<typeof fakeProfile>,
  path = "/dashboard/settings/profile"
) {
  const { me, role } = backend.state
  const errorElement = <p>errore della rotta</p>
  const router = createMemoryRouter(
    [
      {
        path: "/dashboard/settings/profile",
        errorElement,
        element: <ProfilePage />,
      },
      { path: "/dashboard/settings/team", errorElement, element: <TeamPage /> },
      {
        path: "/dashboard/settings/team/:id",
        errorElement,
        element: <MemberPage />,
      },
      {
        path: "/dashboard/settings/blacklist",
        errorElement,
        element: <BlacklistPage />,
      },
      { path: "/dashboard", element: <p>la dashboard</p> },
      { path: "/dashboard/customers/:id", element: <p>il cliente</p> },
    ],
    { initialEntries: [path] }
  )
  const store = createUserPreferenceStore({ role, operatorId: me.id })
  onTestFinished(() => router.dispose())
  return {
    router,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <RouterProvider router={router} />
      </UserPreferenceContext>,
      { handlers: backend.handlers, auth: signedInAs(me, role) }
    ),
  }
}
