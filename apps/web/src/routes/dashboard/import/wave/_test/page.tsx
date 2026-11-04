import { type Layer } from "effect"
import { createMemoryRouter, RouterProvider } from "react-router"
import { onTestFinished } from "vitest"
import { type Authenticated } from "@mito/contract/middleware"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakeImport } from "@/test/import"
import { Component as WaveRoute } from "../WavePage"

/**
 * Renders the page of a Wave at `url` (`/dashboard/import/5` by default), on
 * the backend of the test, with the history at /dashboard/import. With
 * `role: undefined` the page doesn't know the role, as when `GET /me` failed
 */
export function renderWave(
  backend: ReturnType<typeof fakeImport>,
  options: {
    role?: Role | undefined
    url?: string
    /** The session of the backend, where a test changes it between two calls */
    auth?: Layer.Layer<Authenticated>
  } = {}
) {
  const role = "role" in options ? options.role : "ADMIN"
  const router = createMemoryRouter(
    [
      {
        path: "/dashboard/import",
        errorElement: <p>errore della rotta</p>,
        children: [
          { index: true, element: <p>Storico degli import</p> },
          { path: ":id", element: <WaveRoute /> },
        ],
      },
    ],
    { initialEntries: [options.url ?? "/dashboard/import/5"] }
  )
  const store = createUserPreferenceStore({ role, operatorId: ada.id })
  onTestFinished(() => router.dispose())
  return {
    router,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <RouterProvider router={router} />
      </UserPreferenceContext>,
      {
        handlers: backend.handlers,
        auth: options.auth ?? signedInAs(ada, role ?? "ADMIN"),
      }
    ),
  }
}
