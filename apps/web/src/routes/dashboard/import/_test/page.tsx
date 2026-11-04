import { type ReactNode } from "react"
import { createMemoryRouter, Outlet, RouterProvider } from "react-router"
import { onTestFinished, vi } from "vitest"
import { type ImportReader } from "@mito/client/import/readImportFile"
import { type Role } from "@mito/contract/schemas"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { type fakeImport } from "@/test/import"
import { OpenImportFile } from "../_components/useNewImport"
import { ImportStatusProvider } from "../ImportStatus"
import { Component as ImportPage } from "../ImportPage"

/** A reader of the file the test drives: each step answers what it's told */
export const fakeReader = () => ({
  read: vi.fn<ImportReader["read"]>(),
  preview: vi.fn<ImportReader["preview"]>(),
  body: vi.fn<ImportReader["body"]>(),
  report: vi.fn<ImportReader["report"]>(),
  cancel: vi.fn<ImportReader["cancel"]>(),
})

/**
 * Renders `ui` (the import page, by default) at /dashboard/import, inside the
 * notice of an import's end as in the shell, on the backend of the test: an
 * error of a route shows "errore della rotta". The files chosen are opened
 * with `open`, and collected in `opened`. With `role: undefined` the page
 * doesn't know the role, as when `GET /me` failed: the fake backend doesn't
 * serve it
 */
export function renderImport(
  backend: ReturnType<typeof fakeImport>,
  options: {
    role?: Role | undefined
    open?: (file: File) => ImportReader
    ui?: ReactNode
  } = {}
) {
  const role = "role" in options ? options.role : "ADMIN"
  const opened: File[] = []
  const reader = fakeReader()
  const open =
    options.open ??
    ((file: File) => {
      opened.push(file)
      return reader
    })
  // As the shell: the notice of an import's end sits in the layout of
  // /dashboard, inside the router, so the toast's link can navigate. The Wave
  // page stands for `/dashboard/import/:id`
  const router = createMemoryRouter(
    [
      {
        path: "/dashboard",
        errorElement: <p>errore della rotta</p>,
        element: (
          <ImportStatusProvider>
            <Outlet />
          </ImportStatusProvider>
        ),
        children: [
          { path: "import", element: options.ui ?? <ImportPage /> },
          { path: "import/:id", element: <p>pagina della Wave</p> },
        ],
      },
    ],
    { initialEntries: ["/dashboard/import"] }
  )
  const store = createUserPreferenceStore({ role, operatorId: ada.id })
  onTestFinished(() => router.dispose())
  return {
    router,
    reader,
    opened,
    ...renderWithApi(
      <UserPreferenceContext value={store}>
        <OpenImportFile value={open}>
          <RouterProvider router={router} />
        </OpenImportFile>
      </UserPreferenceContext>,
      { handlers: backend.handlers, auth: signedInAs(ada, role ?? "ADMIN") }
    ),
  }
}
