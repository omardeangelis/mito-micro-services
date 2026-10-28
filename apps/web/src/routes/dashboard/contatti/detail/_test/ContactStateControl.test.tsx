import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ContactForbidden } from "@mito/contract/errors"
import { type TaskStatus } from "@mito/contract/task"
import { contactDetail, superseded } from "@/test/contacts"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { currentHref } from "../../_test/page"
import {
  DA,
  detailPath,
  gate,
  holdChanges,
  lastAlert,
  openDetail,
  sheet,
  sheetStatus,
  toastLink,
} from "./detail"

// The state of the contact in the detail, as the tests of
// `ContactStateControl` of the Next.js app, on the page with a backend in
// memory

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")!

/** The detail of the contact of `contactRow` in `state` */
const setup = (state: TaskStatus | null = "app.to") =>
  openDetail([contactDetail({ contact: { state } })])

const choose = async (
  user: Awaited<ReturnType<typeof setup>>["user"],
  state: string
) => {
  await user.click(trigger())
  await user.click(screen.getByRole("menuitemradio", { name: state }))
}

/** The address goes back to `href` on "Indietro"? It is in the history */
const historyLength = () => window.history.length

beforeEach(() => {
  sessionStorage.clear()
})

describe("il selettore dello stato nel dettaglio (AC30, AC39, AC40)", () => {
  it("salva con la sorgente 'detail' e mostra il valore salvato finché non è a schermo il nuovo", async () => {
    const { user, backend } = await setup("app.to")
    const open = holdChanges(backend)

    await choose(user, "erogata")

    // The saved value stays, the wait is shown, a second change is not sent
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("true")
    )
    expect(trigger().getAttribute("aria-label")).toBe("app.to, cambia stato")
    open()
    await waitFor(() =>
      expect(backend.state.changes).toEqual([
        {
          taskId: 101,
          toState: "erogata",
          source: "detail",
          confirmedAlertId: null,
        },
      ])
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe("erogata, cambia stato")
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("false")
    )
    // Nothing reopened: the address and the sheet stay
    expect(currentHref()).toBe(detailPath(101, DA))
    expect(sheetStatus().textContent).toBe("")
  })

  it("non offre lo stato attuale: riselezionarlo non chiama il server (AC40)", async () => {
    const { user, backend } = await setup("app.to")

    await user.click(trigger())

    expect(screen.queryByRole("menuitemradio", { name: "app.to" })).toBeNull()
    expect(backend.state.changes).toHaveLength(0)
  })

  it("salvato, la lista dietro la finestra è letta di nuovo", async () => {
    const { user, backend } = await setup("app.to")

    await choose(user, "erogata")

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe("erogata, cambia stato")
    )
    expect(backend.state.detailReads.length).toBeGreaterThan(1)
  })
})

describe("la riapertura (AC34, AC35, A12)", () => {
  const reopen = async () => {
    const view = await openDetail([
      contactDetail({ contact: { state: "non interessato" } }),
      contactDetail({ contact: { id: 202, state: "chiamare" } }),
    ])
    view.backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })
    return view
  }

  it("sostituisce l'indirizzo con quello del contatto nuovo, conserva la vista della lista e lo annuncia", async () => {
    const { user, navigations } = await reopen()
    const before = historyLength()

    await choose(user, "chiamare")

    await waitFor(() => expect(currentHref()).toBe(detailHrefFromDa(202, DA)))
    // replace, not push: "Indietro" must not return to the superseded contact
    expect(navigations).toEqual([`REPLACE ${detailHrefFromDa(202, DA)}`])
    expect(historyLength()).toBe(before)
    expect(sheetStatus().textContent).toBe(
      "Contatto riaperto. Il precedente resta tra i contatti precedenti"
    )
  })

  it("il selettore del contatto nuovo prende il focus quando arriva", async () => {
    const { user } = await reopen()

    await choose(user, "chiamare")

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "chiamare, cambia stato"
      )
    )
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it("fino all'arrivo del contatto nuovo resta il vecchio, in attesa", async () => {
    const { user, backend } = await reopen()
    let open!: () => void
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })

    await choose(user, "chiamare")
    backend.state.detailGate = gate
    await waitFor(() => expect(currentHref()).toBe(detailHrefFromDa(202, DA)))

    expect(trigger().getAttribute("aria-label")).toBe(
      "non interessato, cambia stato"
    )
    expect(trigger().getAttribute("aria-disabled")).toBe("true")
    open()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "chiamare, cambia stato"
      )
    )
  })

  it("se la finestra si è chiusa nel frattempo non naviga: la lista mostra il contatto nuovo", async () => {
    const { user, backend, navigations } = await reopen()
    const open = holdChanges(backend)

    await choose(user, "chiamare")
    await user.keyboard("{Escape}")
    await screen.findByRole("table", { name: "Contatti" })
    const reads = backend.state.queries.length
    open()

    // The list is read again, and nobody is taken to the new contact
    await waitFor(() =>
      expect(backend.state.queries.length).toBeGreaterThan(reads)
    )
    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
  })
})

describe("la riapertura e la chiusura della finestra (AC25, AC35)", () => {
  it("se la finestra sta già chiudendo non naviga: la sua navigazione verrebbe scartata e si resterebbe sul contatto nuovo", async () => {
    // The list is not loaded yet: the close waits for it while the answer
    // of the reopening comes
    const list = gate()
    const { user, backend, navigations } = await openDetail(
      [
        contactDetail({ contact: { state: "non interessato" } }),
        contactDetail({ contact: { id: 202, state: "chiamare" } }),
      ],
      { listGate: list.closed }
    )
    backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })
    const open = holdChanges(backend)
    await choose(user, "chiamare")

    await user.keyboard("{Escape}")
    open()
    await waitFor(() => expect(backend.state.changes).toHaveLength(1))
    list.open()

    await screen.findByRole("table", { name: "Contatti" })
    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
  })
})

describe("con un alert aperto (AC36, AC37)", () => {
  const alert = {
    id: 5,
    deadline: new Date("2026-10-20T22:00:00Z"),
    message: "Richiamare dopo le 15",
  }
  const withAlert = async () => {
    const view = await openDetail([
      contactDetail({ contact: { state: "richiamare" }, alert }),
    ])
    view.backend.state.changeAnswer = ({ confirmedAlertId }) =>
      confirmedAlertId === null ? "alert" : { saved: true }
    return view
  }

  it("chiede la conferma con la data e il messaggio, senza toast e senza annunci", async () => {
    const { user } = await withAlert()

    await choose(user, "erogata")

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Richiamare dopo le 15")).toBeTruthy()
    expect(
      screen.queryByText("Il contatto ha un richiamo aperto da confermare")
    ).toBeNull()
    expect(lastAlert()).toBe("")
  })

  it("Annulla non cambia niente e riporta il focus sul selettore", async () => {
    const { user, backend } = await withAlert()
    await choose(user, "erogata")

    await user.click(await screen.findByRole("button", { name: "Annulla" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chiudere il richiamo?" })
      ).toBeNull()
    )
    expect(backend.state.changes).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
    expect(trigger().getAttribute("aria-label")).toBe(
      "richiamare, cambia stato"
    )
    // Only the confirmation closed: the sheet stays
    expect(sheet()).toBeTruthy()
  })

  it("Esc annulla allo stesso modo, e la finestra resta", async () => {
    const { user, backend } = await withAlert()
    await choose(user, "erogata")
    await screen.findByRole("dialog", { name: "Chiudere il richiamo?" })

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chiudere il richiamo?" })
      ).toBeNull()
    )
    expect(backend.state.changes).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
    expect(currentHref()).toBe(detailPath(101, DA))
  })

  it("'Cambia stato' rimanda il cambio confermando l'alert", async () => {
    const { user, backend } = await withAlert()
    await choose(user, "erogata")

    await user.click(
      await screen.findByRole("button", { name: "Cambia stato" })
    )

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe("erogata, cambia stato")
    )
    expect(backend.state.changes[1]).toEqual({
      taskId: 101,
      toState: "erogata",
      source: "detail",
      confirmedAlertId: 5,
    })
    expect(
      within(screen.getByRole("region", { name: "Prossimo alert" })).getByText(
        "Nessun alert aperto"
      )
    ).toBeTruthy()
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("per i permessi: toast con il motivo, lo stesso testo per gli ausili dentro la finestra, valore salvato", async () => {
    const { user, backend } = await setup("app.to")
    backend.state.changeAnswer = () => ({
      rejected: new ContactForbidden({ assignee: "Giulia Bianchi" }),
    })

    await choose(user, "erogata")

    const reason =
      "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi"
    // The toast region is hidden to assistive technology while the sheet is open
    await waitFor(() => expect(lastAlert()).toBe(reason))
    expect(screen.getAllByText(reason)).toHaveLength(2)
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("false")
    )
    expect(trigger().getAttribute("aria-label")).toBe("app.to, cambia stato")
    expect(currentHref()).toBe(detailPath(101, DA))
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista", async () => {
    const { user, backend } = await openDetail([
      contactDetail({ contact: { state: "app.to" } }),
      contactDetail({ contact: { id: 303, state: "chiamare" } }),
    ])
    backend.state.changeAnswer = () => ({ rejected: superseded(303) })

    await choose(user, "erogata")

    await waitFor(() =>
      expect(lastAlert()).toBe(
        "Questo contatto è stato sostituito da uno più recente"
      )
    )
    const active = toastLink("Vai al contatto attivo")
    expect(active.getAttribute("href")).toBe(detailHrefFromDa(303, DA))
    await user.click(active)
    await waitFor(() => expect(currentHref()).toBe(detailHrefFromDa(303, DA)))
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "chiamare, cambia stato"
      )
    )
  })

  it("con il backend che non risponde dice 'Modifica non salvata, riprova' (AC39)", async () => {
    const { user, backend } = await setup("app.to")
    backend.state.changeAnswer = () => "down"

    await choose(user, "erogata")

    await waitFor(() =>
      expect(lastAlert()).toBe("Modifica non salvata, riprova")
    )
    expect(screen.getAllByText("Modifica non salvata, riprova")).toHaveLength(2)
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("false")
    )
    expect(trigger().getAttribute("aria-label")).toBe("app.to, cambia stato")
  })
})

describe("il focus all'apertura", () => {
  it("aprendo il dettaglio il focus è sul titolo, non sul selettore", async () => {
    await setup("chiamare")

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Dettaglio contatto" })
    )
  })
})
