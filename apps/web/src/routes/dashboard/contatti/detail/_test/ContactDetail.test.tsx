import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createBrowserRouter, RouterProvider } from "react-router"
import { describe, expect, it, onTestFinished } from "vitest"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { contactDetail, fakeContacts } from "@/test/contacts"
import { ContactDetail } from "../_components/ContactDetail"

const links = {
  closeHref: "/altrove",
  closeLabel: "Torna altrove",
  detailHref: (id: number) => `/altrove?contatto=${id}`,
  savesReturnFocus: false,
}

/** The detail of contact 101 on a page that is not the route of the detail */
const renderDetail = (
  details: Record<number, ReturnType<typeof contactDetail>> = {
    101: contactDetail(),
  }
) => {
  window.history.replaceState(null, "", "/pagina")
  const router = createBrowserRouter([
    { path: "/pagina", element: <ContactDetail id="101" links={links} /> },
    { path: "*", element: <p>altra pagina</p> },
  ])
  onTestFinished(() => {
    router.dispose()
    window.history.replaceState(null, "", "/")
  })
  const backend = fakeContacts({ details })
  const store = createUserPreferenceStore({
    role: "OPERATORE",
    operatorId: ada.id,
  })
  return renderWithApi(
    <UserPreferenceContext value={store}>
      <RouterProvider router={router} />
    </UserPreferenceContext>,
    { handlers: backend.handlers, auth: signedInAs(ada, "OPERATORE") }
  )
}

describe("ContactDetail con i link di chi lo apre", () => {
  it("chiuso con Esc va all'indirizzo di chiusura ricevuto", async () => {
    renderDetail()
    await screen.findByText("Rossi Mario")

    await userEvent.setup().keyboard("{Escape}")

    await waitFor(() => expect(window.location.pathname).toBe("/altrove"))
  })

  it("il link al contatto attivo di uno sostituito usa l'indirizzo di chi lo apre", async () => {
    renderDetail({
      101: contactDetail({
        editability: { kind: "superseded" },
        activeTaskId: 202,
        contact: { isActive: false },
      }),
    })
    const link = await screen.findByRole("link", {
      name: "Vai al contatto attivo",
    })

    expect(link.getAttribute("href")).toBe("/altrove?contatto=202")
  })

  it("senza salvare il ritorno del focus, la chiusura non scrive in sessionStorage", async () => {
    sessionStorage.clear()
    renderDetail()
    await screen.findByText("Rossi Mario")

    await userEvent.setup().keyboard("{Escape}")

    await waitFor(() => expect(window.location.pathname).toBe("/altrove"))
    expect(sessionStorage.getItem("contatti:return-focus")).toBeNull()
  })

  it("un contatto che non esiste offre il pulsante con il testo e l'indirizzo ricevuti", async () => {
    renderDetail({})

    const link = await screen.findByRole("link", { name: "Torna altrove" })

    expect(link.getAttribute("href")).toBe("/altrove")
  })
})
