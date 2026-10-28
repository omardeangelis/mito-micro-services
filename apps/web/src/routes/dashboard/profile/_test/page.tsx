import { type ReactNode } from "react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { renderWithApi, signedInAs } from "@/test/api"
import { type fakeProfile } from "@/test/profile"
import { Component as ProfilePage } from "../ProfilePage"

/**
 * Renders `ui` (the profile page, by default) at `path`, on the backend of
 * the test, signed in as its current user: an error of a route shows
 * "errore della rotta", and /dashboard "la dashboard"
 */
export function renderProfile(
  backend: ReturnType<typeof fakeProfile>,
  options: { path?: string; ui?: ReactNode } = {}
) {
  const { me, role } = backend.state
  const router = createMemoryRouter(
    [
      {
        path: "/dashboard/profile",
        errorElement: <p>errore della rotta</p>,
        element: options.ui ?? <ProfilePage />,
      },
      { path: "/dashboard", element: <p>la dashboard</p> },
      { path: "/dashboard/customers/:id", element: <p>il cliente</p> },
    ],
    { initialEntries: [options.path ?? "/dashboard/profile"] }
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
