import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ContactForbidden } from "@mito/contract/errors"
import { type Role } from "@mito/contract/schemas"
import { type ContactRow } from "@mito/contract/task"
import { defaultState, detailHref } from "@mito/client/contact/searchParams"
import {
  contactCustomer,
  contactRow,
  fakeContacts,
  superseded,
} from "@/test/contacts"
import { expectToastLasts, sleep } from "@/test/toast"
import { currentHref, findTable, renderContacts } from "./page"

// The state cell of a row, as the tests of `ContactRowState` of the Next.js
// app, in the list on a backend in memory: Ada is the signed-in user, and the
// contact of `contactRow` is hers

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

/** The list with one row, `contact` */
const setup = async (
  contact: ContactRow = contactRow(),
  role?: Role | null
) => {
  const backend = fakeContacts({ rows: [contact] })
  const view = renderContacts("/dashboard/contatti", backend, { role })
  await findTable()
  return { ...view, backend }
}

/** Holds the state changes until the returned function is called */
const holdChanges = (backend: ReturnType<typeof fakeContacts>) => {
  let open!: () => void
  backend.state.changeGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return open
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")

const choose = async (
  user: Awaited<ReturnType<typeof setup>>["user"],
  state: string
) => {
  await user.click(trigger()!)
  await user.click(screen.getByRole("menuitemradio", { name: state }))
}

/**
 * Waits until `element` takes the pointer: the menu is modal until it is
 * closed, and the region of the toasts takes it once it counts its toast
 */
const pointerReaches = (element: HTMLElement) =>
  waitFor(() => {
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.parentElement
    )
      expect(node.style.pointerEvents).not.toBe("none")
  })

/** The cell of the state of the only row */
const stateCell = () =>
  screen.getAllByRole("row")[1]!.querySelector<HTMLElement>("div.w-40")!

describe("la cella dello stato nella riga: chi può modificare (AC9, AC49, AC51)", () => {
  it("il proprietario del contatto ha il selettore, che porta il cliente nel nome accessibile", async () => {
    await setup()

    expect(trigger()).not.toBeNull()
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
    expect(trigger()!.getAttribute("aria-describedby")).toBe(
      "contact-customer-101"
    )
  })

  it("chi ha il cliente ma non il contatto lo modifica (D2)", async () => {
    await setup(contactRow({ operator: giulia }))

    expect(trigger()).not.toBeNull()
  })

  it("un amministratore modifica anche il contatto di un collega", async () => {
    await setup(
      contactRow({
        operator: giulia,
        customer: contactCustomer({ operatorId: giulia.id }),
      }),
      "ADMIN"
    )

    expect(trigger()).not.toBeNull()
  })

  it("il contatto di un collega mostra lo stato e a chi è assegnato, senza selettore", async () => {
    await setup(
      contactRow({
        operator: giulia,
        customer: contactCustomer({ operatorId: giulia.id }),
      })
    )

    expect(trigger()).toBeNull()
    expect(within(stateCell()).getByText("chiamare")).toBeTruthy()
    expect(screen.getByText("Assegnato a Giulia Bianchi")).toBeTruthy()
  })

  it("un contatto non assegnato dice 'Non assegnato'", async () => {
    await setup(
      contactRow({
        operator: null,
        customer: contactCustomer({ operatorId: giulia.id }),
      })
    )

    expect(trigger()).toBeNull()
    expect(within(stateCell()).getByText("Non assegnato")).toBeTruthy()
  })

  it("un contatto superato dice 'Concluso' e non si modifica nella riga (AC3)", async () => {
    await setup(contactRow({ isActive: false }))

    expect(trigger()).toBeNull()
    expect(within(stateCell()).getByText("Concluso")).toBeTruthy()
    expect(within(stateCell()).getByText("chiamare")).toBeTruthy()
  })

  it("finché non si sa chi è l'utente mostra solo lo stato", async () => {
    await setup(contactRow(), null)

    expect(trigger()).toBeNull()
    expect(within(stateCell()).getByText("chiamare")).toBeTruthy()
  })

  it("la cella ha la larghezza fissa w-40 con il selettore", async () => {
    await setup()

    expect(trigger()!.closest("div.w-40")).not.toBeNull()
  })

  it("la cella ha la larghezza fissa w-40 anche in sola lettura", async () => {
    await setup(contactRow({ isActive: false }))

    expect(
      within(stateCell()).getByText("chiamare").closest("div.w-40")
    ).not.toBeNull()
  })
})

describe("il cambio di stato nella riga (AC9, AC31, A9)", () => {
  it("salva con la sorgente 'list' e mostra il valore salvato finché il nuovo non è a schermo", async () => {
    const { user, backend } = await setup()
    const open = holdChanges(backend)

    await choose(user, "app.to")

    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).toBe("true")
    )
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
    open()
    await waitFor(() =>
      expect(backend.state.changes).toEqual([
        {
          taskId: 101,
          toState: "app.to",
          source: "list",
          confirmedAlertId: null,
        },
      ])
    )
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-label")).toBe("app.to, cambia stato")
    )
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).toBe("false")
    )
  })

  it("riuscito: toast con il nome del cliente e lo stato, e la lista si rilegge", async () => {
    const { user, backend } = await setup()
    const read = backend.state.queries.length

    await choose(user, "app.to")

    expect(await screen.findByText("Rossi Mario: app.to")).toBeTruthy()
    await waitFor(() => expect(backend.state.queries.length).toBe(read + 1))
  })

  it("riapertura: il toast offre [Apri] sul contatto nuovo", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "non interessato" })
    )
    backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })

    await choose(user, "chiamare")

    expect(await screen.findByText("Rossi Mario: chiamare")).toBeTruthy()
    const open = screen.getByRole("link", { name: "Apri" })
    await pointerReaches(open)
    expect(open.getAttribute("href")).toBe(detailHref(202, defaultState))
    await user.click(open)
    expect(await screen.findByText("dettaglio")).toBeTruthy()
    expect(currentHref()).toBe(detailHref(202, defaultState))
    // The toast goes with the link, as with the `Link` of Next.js
    await waitFor(() =>
      expect(screen.queryByText("Rossi Mario: chiamare")).toBeNull()
    )
  })

  it("riapertura: [Apri] con Ctrl apre una scheda nuova e lascia il toast (AC27)", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "non interessato" })
    )
    backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })

    await choose(user, "chiamare")

    const text = await screen.findByText("Rossi Mario: chiamare")
    const open = screen.getByRole("link", { name: "Apri" })
    await pointerReaches(open)
    await user.keyboard("{Control>}")
    await user.click(open)
    await user.keyboard("{/Control}")
    // Sonner closes a toast a frame later, and keeps it 200 ms more: a toast
    // still there at once proves nothing (D13)
    await sleep(250)

    expect(screen.queryByText("dettaglio")).toBeNull()
    expect(text.closest("[data-sonner-toast]")).toHaveAttribute(
      "data-removed",
      "false"
    )
  })

  it("riselezionare lo stato attuale non è possibile: non c'è fra le opzioni (AC40)", async () => {
    const { user, backend } = await setup()

    await user.click(trigger()!)

    expect(screen.queryByRole("menuitemradio", { name: "chiamare" })).toBeNull()
    expect(backend.state.changes).toHaveLength(0)
  })
})

describe("con un alert aperto (AC36, AC37)", () => {
  const alert = {
    id: 5,
    deadline: new Date("2026-10-20T22:00:00Z"),
    message: "Richiamare dopo le 15",
  }
  const withAlert = () => contactRow({ state: "richiamare", alert })

  it("chiede la conferma, e annullando il focus torna sul selettore e non si salva niente", async () => {
    const { user, backend } = await setup(withAlert())
    backend.state.changeAnswer = ({ confirmedAlertId }) =>
      confirmedAlertId === null ? "alert" : { saved: true }

    await choose(user, "erogata")

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Richiamare dopo le 15")).toBeTruthy()
    expect(
      screen.queryByText("Il contatto ha un richiamo aperto da confermare")
    ).toBeNull()

    await user.click(within(dialog).getByRole("button", { name: "Annulla" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(backend.state.changes).toHaveLength(1)
    expect(document.activeElement).toBe(trigger())
    expect(trigger()!.getAttribute("aria-label")).toBe(
      "richiamare, cambia stato"
    )
  })

  it("confermando rimanda il cambio con l'alert e poi mostra il toast con il nome del cliente", async () => {
    const { user, backend } = await setup(withAlert())
    backend.state.changeAnswer = ({ confirmedAlertId }) =>
      confirmedAlertId === null ? "alert" : { saved: true }

    await choose(user, "erogata")
    await user.click(
      await screen.findByRole("button", { name: "Cambia stato" })
    )

    expect(await screen.findByText("Rossi Mario: erogata")).toBeTruthy()
    expect(backend.state.changes[1]).toEqual({
      taskId: 101,
      toState: "erogata",
      source: "list",
      confirmedAlertId: 5,
    })
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("per i permessi: toast di rifiuto con il motivo, nessun toast di successo, valore salvato", async () => {
    const { user, backend } = await setup()
    backend.state.changeAnswer = () => ({
      rejected: new ContactForbidden({ assignee: "Giulia Bianchi" }),
    })
    const read = backend.state.queries.length

    await choose(user, "app.to")

    expect(
      await screen.findByText(
        "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi"
      )
    ).toBeTruthy()
    expect(screen.queryByText("Rossi Mario: app.to")).toBeNull()
    await waitFor(() => expect(backend.state.queries.length).toBe(read + 1))
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo", async () => {
    const { user, backend } = await setup()
    backend.state.changeAnswer = () => ({ rejected: superseded(303) })

    await choose(user, "app.to")

    expect(
      await screen.findByText(
        "Questo contatto è stato sostituito da uno più recente"
      )
    ).toBeTruthy()
    const active = screen.getByRole("link", { name: "Vai al contatto attivo" })
    expect(active.getAttribute("href")).toBe(detailHref(303, defaultState))
    await pointerReaches(active)
    await user.click(active)
    expect(await screen.findByText("dettaglio")).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Questo contatto è stato sostituito da uno più recente"
        )
      ).toBeNull()
    )
  })

  it(
    "il toast del contatto sostituito dura 8 s (AC13)",
    { timeout: 20_000 },
    async () => {
      const { user, backend } = await setup()
      backend.state.changeAnswer = () => ({ rejected: superseded(303) })

      await choose(user, "app.to")

      const text = "Questo contatto è stato sostituito da uno più recente"
      await screen.findByText(text)
      await expectToastLasts(text, 8000)
    }
  )

  it(
    "riapertura: il toast con [Apri] dura 8 s (AC13)",
    { timeout: 20_000 },
    async () => {
      const { user, backend } = await setup(
        contactRow({ state: "non interessato" })
      )
      backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })

      await choose(user, "chiamare")

      await screen.findByText("Rossi Mario: chiamare")
      await expectToastLasts("Rossi Mario: chiamare", 8000)
    }
  )

  it("con il backend che non risponde il valore torna indietro e dice 'Modifica non salvata, riprova' (AC39)", async () => {
    const { user, backend } = await setup()
    backend.state.changeAnswer = () => "down"

    await choose(user, "app.to")

    expect(
      await screen.findByText("Modifica non salvata, riprova")
    ).toBeTruthy()
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
  })

  it("se la lista non c'è più durante il salvataggio, il rifiuto mostra comunque il toast", async () => {
    const { user, backend, router } = await setup()
    backend.state.changeAnswer = () => ({
      rejected: new ContactForbidden({ assignee: null }),
    })
    const open = holdChanges(backend)
    await choose(user, "app.to")

    await router.navigate("/altrove")
    expect(await screen.findByText("altra pagina")).toBeTruthy()
    open()

    expect(
      await screen.findByText(
        "Non puoi modificare questo contatto: non è assegnato"
      )
    ).toBeTruthy()
  })
})
