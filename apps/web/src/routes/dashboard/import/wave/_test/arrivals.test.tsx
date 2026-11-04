import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { Unauthorized } from "@mito/contract/errors"
import { ada } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"
import { member } from "../split/_test/harness"
import { renderWave } from "./page"

const unconfirmed = (overrides: Parameters<typeof waveView>[0] = {}) =>
  waveView({
    name: "Ottobre",
    deadline: null,
    status: "unconfirmed",
    workdaysLeft: null,
    ...overrides,
  })

const none = () =>
  unconfirmed({
    toAssign: 0,
    origin: {
      new: { withOperator: 0, withoutOperator: 0 },
      existing: { withOperator: 10, withoutOperator: 0 },
      traceRebuilt: false,
    },
  })

// 4 to assign (2 new + 2 present) out of 10; 6 assigned, 1 of which new
const mixed = (overrides: Parameters<typeof waveView>[0] = {}) =>
  unconfirmed({
    customers: 10,
    toAssign: 4,
    origin: {
      new: { withOperator: 1, withoutOperator: 2 },
      existing: { withOperator: 4, withoutOperator: 3 },
      traceRebuilt: false,
    },
    alreadyAssigned: {
      toCall: 3,
      noAnswer: 1,
      recall: 1,
      outcome: 1,
      noContact: 0,
    },
    ...overrides,
  })

const column = (title: string) =>
  within(
    screen.getByRole("heading", { level: 4, name: title }).closest("section")!
  )

describe("«Ingressi e scadenza» senza clienti da assegnare (AC8)", () => {
  it("«Conferma la scadenza» salva con confirm e mostra «Nessun cliente da assegnare.»", async () => {
    const backend = fakeImport({ wave: none() })
    renderWave(backend)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole("button", { name: "Conferma la scadenza" })
    )

    expect(
      await screen.findByText("Nessun cliente da assegnare.")
    ).toBeVisible()
    expect(backend.state.deadlines).toEqual([
      { id: 5, input: { deadline: "2026-12-04", kind: "confirm" } },
    ])
    const title = screen.getByRole("heading", {
      name: /^Scadenza della Ottobre: /,
    })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByRole("button", { name: "Vai alla Wave" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Vai alla Wave" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Ottobre" })
    ).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: /^Scadenza della/ })
    ).not.toBeInTheDocument()
  })

  it("i passi in fila sono uno solo", async () => {
    renderWave(fakeImport({ wave: none() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })

    expect(
      screen.queryByRole("list", { name: "Passi" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Avanti" })
    ).not.toBeInTheDocument()
  })
})

describe("La distribuzione (AC5, AC33)", () => {
  it("l'anello ha un nome con tutti i numeri dei due anelli, e al centro «da assegnare»", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    const ring = await screen.findByRole("img", {
      name: /^Da assegnare 4 su 10/,
    })

    const name = ring.getAttribute("aria-label")
    expect(name).toBe(
      "Da assegnare 4 su 10. Per destinazione: Nuovi senza operatore 2, Già presenti senza operatore 3, Da chiamare 3, Non risponde 1, Richiamo 1, Con esito 1. Per provenienza: Nuovi 3, Già presenti nel CRM 7"
    )
    expect(within(ring).getByText("da assegnare")).toBeVisible()
  })

  it("le tre colonne hanno titolo di un livello sotto quello del passo, numero e voci", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    await screen.findByRole("heading", {
      level: 3,
      name: "Ingressi e scadenza",
    })

    const imported = column("Clienti importati")
    expect(imported.getByText("10")).toBeVisible()
    expect(
      imported.getByText(
        "Tutti i clienti del file. Nel grafico, l'anello interno."
      )
    ).toBeVisible()
    const rows = imported.getAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("Nuovi")
    expect(rows[0]).toHaveTextContent("non erano nel CRM")
    expect(rows[0]).toHaveTextContent("3")
    expect(rows[1]).toHaveTextContent("Già presenti nel CRM")
    expect(rows[1]).toHaveTextContent("7")

    const toAssign = column("Da assegnare")
    expect(
      toAssign.getByText("Li dividi tra gli operatori al passo «Assegna».")
    ).toBeVisible()
    const assignRows = toAssign.getAllByRole("listitem")
    expect(assignRows[0]).toHaveTextContent("Nuovi")
    expect(assignRows[0]).toHaveTextContent(
      "clienti che entrano con questo import"
    )
    expect(assignRows[0]).toHaveTextContent("2")
    expect(assignRows[1]).toHaveTextContent("Senza operatore")
    expect(assignRows[1]).toHaveTextContent(
      "presenti ma non assegnati ad alcun operatore"
    )
    expect(assignRows[1]).toHaveTextContent("3")

    const assigned = column("Già assegnati")
    expect(assigned.getByText(/^Nella Wave e già assegnati/)).toBeVisible()
    const stay = assigned.getAllByRole("listitem")
    expect(stay.map((row) => row.textContent)).toEqual([
      "Da chiamareaspettano una chiamata3",
      "Non rispondegià tentati1",
      "Richiamorestano con il loro richiamo1",
      "Con esitoappuntamento, pratica caricata, non interessato1",
    ])
  })

  it("«Senza contatto» c'è solo quando non è 0, anche nel nome del grafico", async () => {
    renderWave(
      fakeImport({
        wave: mixed({
          customers: 12,
          alreadyAssigned: {
            toCall: 3,
            noAnswer: 1,
            recall: 1,
            outcome: 1,
            noContact: 2,
          },
        }),
      })
    )
    await screen.findByRole("heading", { level: 4, name: "Già assegnati" })

    const row = column("Già assegnati").getAllByRole("listitem").at(-1)
    expect(row).toHaveTextContent("Senza contatto")
    expect(row).toHaveTextContent(
      "hanno un operatore ma nessun contatto aperto"
    )
    expect(row).toHaveTextContent("2")
    expect(
      screen.getByRole("img", { name: /Senza contatto 2/ })
    ).toBeInTheDocument()
  })

  it("senza «Senza contatto» la voce non c'è", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    await screen.findByRole("heading", { level: 4, name: "Già assegnati" })

    expect(screen.queryByText("Senza contatto")).not.toBeInTheDocument()
  })
})

describe("La scadenza del primo passo (AC6)", () => {
  it("il riquadro ha «Obbligatoria», il testo e il giorno proposto (oggi + 30)", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })

    const box = within(
      screen
        .getByRole("heading", { level: 4, name: "Scadenza" })
        .closest("section")!
    )
    expect(box.getByText("Obbligatoria")).toBeVisible()
    expect(
      box.getByText(
        "Il giorno entro cui le chiamate assegnate andranno eseguite. Le chiamate con una scadenza avranno priorità rispetto a quelle senza."
      )
    ).toBeVisible()
    expect(
      box.getByRole("button", { name: "Scadenza, ven 4 dic" })
    ).toBeVisible()
    expect(box.getByText(/giorni lavorativi$/)).toBeVisible()
  })

  it("il minimo è domani: oggi non si sceglie", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "Scadenza, ven 4 dic" })
    )

    const dialog = await screen.findByRole("dialog", {
      name: "Scegli la scadenza",
    })
    await user.click(
      within(dialog).getByRole("button", { name: /mese precedente/i })
    )
    expect(
      within(dialog).getByRole("button", { name: /\b4 novembre 2026/ })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: /\b5 novembre 2026/ })
    ).toBeEnabled()
  })
})

describe("«Avanti» (AC7, AC31)", () => {
  it("salva la scadenza scelta con confirm, porta ad «Assegna» col fuoco sul titolo, e un secondo Invio non fa nulla", async () => {
    const backend = fakeImport({ wave: mixed() })
    renderWave(backend)
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "Scadenza, ven 4 dic" })
    )
    await user.click(await screen.findByRole("button", { name: "+14 giorni" }))

    const next = screen.getByRole("button", { name: "Avanti" })
    next.focus()
    await user.keyboard("{Enter}")

    const title = await screen.findByRole("heading", { name: "Assegna" })
    await waitFor(() => expect(title).toHaveFocus())
    expect(backend.state.deadlines).toEqual([
      { id: 5, input: { deadline: "2026-11-18", kind: "confirm" } },
    ])

    await user.keyboard("{Enter}")
    expect(backend.state.deadlines).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Assegna" })).toHaveFocus()
    expect(
      screen.queryByRole("heading", { name: "Ingressi e scadenza", level: 3 })
    ).not.toBeInTheDocument()
  })

  it("`?per` su una Wave senza scadenza: dopo «Avanti», «Assegna» ha quella persona sola scelta (AC2)", async () => {
    const team = [
      member(7, "Ada Lovelace", { pace: 3, exactPace: 3, active: 4 }),
      member(8, "Bruno Rossi", { pace: 1, exactPace: 1, active: 2 }),
    ]
    renderWave(fakeImport({ wave: mixed({ team }) }), {
      url: "/dashboard/import/5?per=8",
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole("button", { name: "Avanti" }))

    await screen.findByRole("heading", { name: "Assegna", level: 3 })
    expect(screen.getByRole("checkbox", { name: "Bruno Rossi" })).toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Ada Lovelace" })
    ).not.toBeChecked()
  })
})

describe("«Annulla» (AC9)", () => {
  it("porta alla panoramica senza salvare: «Scadenza da confermare»", async () => {
    const backend = fakeImport({ wave: mixed() })
    renderWave(backend)
    const user = userEvent.setup()

    await user.click(await screen.findByRole("button", { name: "Annulla" }))

    expect(await screen.findByText("Scadenza da confermare")).toBeVisible()
    expect(backend.state.deadlines).toEqual([])
  })
})

describe("Il salvataggio non riuscito (AC7, AC16)", () => {
  it("l'esito incerto resta sul passo, con la data scelta e un solo messaggio sopra il piede", async () => {
    const backend = fakeImport({ wave: mixed() })
    backend.state.outcome.setDeadline = "uncertain"
    renderWave(backend)
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "Scadenza, ven 4 dic" })
    )
    await user.click(await screen.findByRole("button", { name: "+14 giorni" }))
    await user.click(screen.getByRole("button", { name: "Avanti" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non sappiamo se la scadenza è stata salvata. Riprova: salvarla di nuovo non cambia nulla."
    )
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(
      screen.getByRole("heading", { name: "Ingressi e scadenza", level: 3 })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Scadenza, mer 18 nov" })
    ).toBeEnabled()
    expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Annulla" })).toBeEnabled()
  })

  it("un altro errore dichiarato dice che non è stato possibile salvare", async () => {
    const backend = fakeImport({ wave: mixed() })
    backend.state.outcome.setDeadline = "deadlineInvalid"
    renderWave(backend)
    const user = userEvent.setup()

    await user.click(await screen.findByRole("button", { name: "Avanti" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non è stato possibile salvare la scadenza. Riprova."
    )
  })

  it.each([
    [
      "expired" as const,
      "La sessione è scaduta: accedi di nuovo. La scadenza non è cambiata.",
    ],
    ["operator" as const, "Solo un admin può cambiare la scadenza."],
  ])("dopo il rifiuto di accesso (%s) dice il suo testo", async (now, text) => {
    const state = { now: "admin" as "admin" | "expired" | "operator" }
    const auth = Layer.succeed(Authenticated)((endpoint) =>
      Effect.gen(function* () {
        if (state.now === "expired") return yield* new Unauthorized()
        return yield* Effect.provideService(endpoint, CurrentUser, {
          operator: ada,
          actor: {
            operatorId: ada.id,
            role: state.now === "operator" ? "OPERATORE" : "ADMIN",
          },
        })
      })
    )
    renderWave(fakeImport({ wave: mixed() }), { auth })
    const user = userEvent.setup()
    await screen.findByRole("button", { name: "Avanti" })
    state.now = now

    await user.click(screen.getByRole("button", { name: "Avanti" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(text)
    expect(
      screen.getByRole("heading", { name: "Ingressi e scadenza", level: 3 })
    ).toBeVisible()
  })
})

describe("Una Wave ricostruita (AC29)", () => {
  it("mostra la nota e Nuovi a 0", async () => {
    renderWave(
      fakeImport({
        wave: mixed({
          origin: {
            new: { withOperator: 0, withoutOperator: 0 },
            existing: { withOperator: 6, withoutOperator: 4 },
            traceRebuilt: true,
          },
        }),
      })
    )

    expect(
      await screen.findByText(
        "Wave importata prima della traccia dei clienti: Nuovi e Già presenti non si distinguono."
      )
    ).toBeVisible()
    expect(
      column("Clienti importati").getAllByRole("listitem")[0]
    ).toHaveTextContent(/Nuovi.*0$/)
  })

  it("una Wave registrata non ha la nota", async () => {
    renderWave(fakeImport({ wave: mixed() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })

    expect(
      screen.queryByText(/Wave importata prima della traccia/)
    ).not.toBeInTheDocument()
  })
})
