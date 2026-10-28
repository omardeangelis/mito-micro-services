import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakePratiche, practiceCustomer, practiceOf } from "@/test/pratiche"
import { renderPratiche } from "./page"

// The detail of a practice on a backend in memory: the general data and its
// state, the customers and their contacts, as `pratiche/[id]/page.tsx` and
// the tests of `CustomerSection` of the Next.js app

const DETAIL = "/dashboard/pratiche/PR-2026-1"

const showDetail = async () => {
  await screen.findByText("Dettaglio Pratica")
}

/** The select of the state, and its option `name` */
const pickState = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string
) => {
  await user.click(screen.getByRole("combobox"))
  await user.click(await screen.findByRole("option", { name }))
}

const button = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name })

describe("PracticePage, i dati della pratica", () => {
  it("mostra la pratica, il codice dell'intestatario e gli importi", async () => {
    renderPratiche(
      DETAIL,
      fakePratiche({
        practices: [
          practiceOf({ productId: "37", importoRata: "200", ratePagate: 3 }),
        ],
      })
    )
    await showDetail()

    expect(screen.getByDisplayValue("PR-2026-1")).toBeTruthy()
    expect(screen.getByDisplayValue("CQS PARAPUBBLICO")).toBeTruthy()
    // In "CF Intestatario" and in its customer
    expect(screen.getAllByDisplayValue("RSSMRA80A01H501U")).toHaveLength(2)
    expect(screen.getByDisplayValue("15/1/2026")).toBeTruthy()
    // Importo pagato: the rate times the rates paid
    expect(screen.getByDisplayValue("600,00 €")).toBeTruthy()
    expect(screen.getByRole("combobox").textContent).toBe("Liquidata")
  })

  it("una pratica senza prodotto si mostra, dove Next.js falliva", async () => {
    renderPratiche(DETAIL, fakePratiche())

    await showDetail()
  })

  it("legge la pratica dell'ID codificato nell'indirizzo", async () => {
    const backend = fakePratiche({
      practices: [practiceOf({ praticaId: "AB/1 ?x" })],
      customers: { "AB/1 ?x": [practiceCustomer()] },
    })
    renderPratiche("/dashboard/pratiche/AB%2F1%20%3Fx", backend)
    await showDetail()

    expect(backend.state.detailReads).toEqual(["AB/1 ?x"])
    expect(screen.getByDisplayValue("AB/1 ?x")).toBeTruthy()
  })

  it("un ID con un '%' si decodifica una volta sola", async () => {
    const backend = fakePratiche({
      practices: [practiceOf({ praticaId: "A%2FB 50%" })],
      customers: { "A%2FB 50%": [practiceCustomer()] },
    })
    renderPratiche(
      `/dashboard/pratiche/${encodeURIComponent("A%2FB 50%")}`,
      backend
    )
    await showDetail()

    expect(backend.state.detailReads).toEqual(["A%2FB 50%"])
  })

  it("una pratica che non esiste lo dice nella pagina, con il ritorno alla lista", async () => {
    const user = userEvent.setup()
    renderPratiche("/dashboard/pratiche/nessuna", fakePratiche())

    expect(await screen.findByText("Pratica non trovata")).toBeTruthy()
    await user.click(screen.getByRole("link", { name: "Torna a Pratiche" }))

    await waitFor(() =>
      expect(window.location.pathname).toBe("/dashboard/pratiche")
    )
  })

  it("se la pratica non arriva mostra l'errore della rotta", async () => {
    const backend = fakePratiche()
    backend.state.failingDetail = true
    renderPratiche(DETAIL, backend)

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
  })
})

describe("PracticePage, lo stato", () => {
  it("'Modifica' salva lo stato scelto, lo dice e rilegge la pratica", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche(DETAIL, backend)
    await showDetail()
    expect(button("Modifica").disabled).toBe(true)

    await pickState(user, "Chiusa")
    await user.click(button("Modifica"))

    await waitFor(() =>
      expect(backend.state.stateWrites).toEqual([{ id: 1001, state: "Chiusa" }])
    )
    expect(
      await screen.findByText("Pratica aggiornata con successo")
    ).toBeTruthy()
    // The practice read again: its state is the saved one, and the form is
    // clean
    await waitFor(() => expect(backend.state.detailReads).toHaveLength(2))
    await waitFor(() => expect(button("Modifica").disabled).toBe(true))
    expect(screen.getByRole("combobox").textContent).toBe("Chiusa")
  })

  it("non offre lo stato che la pratica ha già", async () => {
    const user = userEvent.setup()
    renderPratiche(DETAIL, fakePratiche())
    await showDetail()

    await user.click(screen.getByRole("combobox"))

    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent
    )
    expect(options).not.toContain("Liquidata")
    expect(options).toContain("Chiusa")
  })

  it("se il server non salva, il toast lo dice e la modifica resta da salvare", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    backend.state.failingState = true
    renderPratiche(DETAIL, backend)
    await showDetail()

    await pickState(user, "Chiusa")
    await user.click(button("Modifica"))

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeTruthy()
    expect(screen.queryByText("Pratica aggiornata con successo")).toBeNull()
    expect(button("Modifica").disabled).toBe(false)
  })

  it("un operatore che non è quello dell'intestatario non la modifica", async () => {
    renderPratiche(
      DETAIL,
      fakePratiche({
        customers: { "PR-2026-1": [practiceCustomer({ operatorId: 9 })] },
      }),
      { role: "OPERATORE" }
    )
    await showDetail()

    expect(
      screen.getByText("Modifica disabilitata: non sei l'operatore assegnato")
    ).toBeTruthy()
    expect(button("Modifica").disabled).toBe(true)
    // Nor the customer
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull()
  })

  it("l'operatore dell'intestatario la modifica", async () => {
    renderPratiche(DETAIL, fakePratiche(), { role: "OPERATORE" })
    await showDetail()

    expect(
      screen.queryByText("Modifica disabilitata: non sei l'operatore assegnato")
    ).toBeNull()
    expect(button("Salva")).toBeTruthy()
  })
})

describe("PracticePage, i clienti", () => {
  it("mostra il cliente con il suo ruolo e il suo operatore", async () => {
    renderPratiche(DETAIL, fakePratiche())
    await showDetail()

    expect(screen.getByText("Intestatario")).toBeTruthy()
    expect(screen.getByDisplayValue("Ada Lovelace")).toBeTruthy()
    expect(screen.getByLabelText("Email")).toHaveProperty(
      "value",
      "mario.rossi@example.com"
    )
    expect(screen.getByLabelText("Telefono")).toHaveProperty(
      "value",
      "3331234567"
    )
  })

  it("'Salva' manda l'id del cliente con email e telefono, lo dice e non resta da salvare", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche(DETAIL, backend)
    await showDetail()
    expect(button("Salva").disabled).toBe(true)

    await user.clear(screen.getByLabelText("Telefono"))
    await user.type(screen.getByLabelText("Telefono"), "3339999999")
    await user.click(button("Salva"))

    await waitFor(() =>
      expect(backend.state.previewWrites).toEqual([
        {
          id: "Xk3bT9qLm2",
          values: {
            email: "mario.rossi@example.com",
            phoneNumber: "3339999999",
          },
        },
      ])
    )
    expect(
      await screen.findByText("Cliente aggiornato con successo")
    ).toBeTruthy()
    await waitFor(() => expect(button("Salva").disabled).toBe(true))
  })

  it("un'email vuota la toglie", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche(DETAIL, backend)
    await showDetail()

    await user.clear(screen.getByLabelText("Email"))
    await user.click(button("Salva"))

    await waitFor(() => expect(backend.state.previewWrites).toHaveLength(1))
    expect(backend.state.previewWrites[0]!.values.email).toBeNull()
  })

  it("un'email che non è un indirizzo non parte", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche(DETAIL, backend)
    await showDetail()

    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "mario@")
    await user.click(button("Salva"))

    expect(await screen.findByText("Invalid email")).toBeTruthy()
    expect(backend.state.previewWrites).toEqual([])
  })

  it("se il server non salva lo dice con il testo di Next.js", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    backend.state.failingPreview = true
    renderPratiche(DETAIL, backend)
    await showDetail()

    await user.type(screen.getByLabelText("Telefono"), "1")
    await user.click(button("Salva"))

    expect(
      await screen.findByText("Errore durante l'aggiornamento del cliente")
    ).toBeTruthy()
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })

  it("con due clienti, 'Salva' di ciascuno manda il suo", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche({
      customers: {
        "PR-2026-1": [
          practiceCustomer(),
          practiceCustomer({
            id: "Gr4nt3Id00",
            name: "Luigi",
            customerRole: "Garante",
            email: null,
            phoneNumber: null,
          }),
        ],
      },
    })
    renderPratiche(DETAIL, backend)
    await showDetail()
    const sections = () =>
      screen
        .getAllByRole("heading", { name: "Cliente" })
        .map((heading) => heading.closest<HTMLElement>(".bg-neutral-50")!)
    // The second customer is closed, as in the Next.js app: it opens
    await user.click(
      within(sections()[1]!).getByRole("button", {
        name: "Mostra i dati del cliente",
      })
    )
    const second = sections()[1]!

    await user.type(within(second).getByLabelText("Telefono"), "3330000000")
    await user.click(within(second).getByRole("button", { name: "Salva" }))

    await waitFor(() =>
      expect(backend.state.previewWrites).toEqual([
        {
          id: "Gr4nt3Id00",
          values: { email: null, phoneNumber: "3330000000" },
        },
      ])
    )
  })

  it("'Vedi profilo' porta al cliente", async () => {
    const user = userEvent.setup()
    renderPratiche(DETAIL, fakePratiche())
    await showDetail()

    await user.click(button("Vedi profilo"))

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/customers/Xk3bT9qLm2")
  })
})
