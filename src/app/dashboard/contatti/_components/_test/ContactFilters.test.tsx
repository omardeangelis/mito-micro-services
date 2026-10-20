import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  defaultState,
  parse,
  type ContactsListState,
} from "../../_lib/searchParams"
import { ContactFilters } from "../ContactFilters"
import { ContactsListShell } from "../ContactsListShell"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

// The tests look at the address; the options of the navigation are the
// business of ContactsListShell.test.tsx
const router = {
  push: (href: string) => {
    mocks.push(href)
  },
  replace: (href: string) => {
    mocks.replace(href)
  },
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({ useRouter: () => router }))

// The columns menu has its own tests
vi.mock("../ContactColumnsMenu", () => ({ ContactColumnsMenu: () => null }))

const operators = [
  { id: 7, name: "Mario", surname: "Rossi" },
  { id: 9, name: "Giulia", surname: "Bianchi" },
]

const renderBar = (state: ContactsListState = defaultState) => {
  const user = userEvent.setup()
  const view = render(
    <ContactsListShell>
      <ContactFilters state={state} operators={operators} />
    </ContactsListShell>
  )
  return { user, ...view }
}

const rerenderBar = (
  view: ReturnType<typeof renderBar>,
  state: ContactsListState
) =>
  view.rerender(
    <ContactsListShell>
      <ContactFilters state={state} operators={operators} />
    </ContactsListShell>
  )

const openAdvanced = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Filtri Avanzati/ }))

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
})

describe("la barra dei filtri", () => {
  it("scegliere uno stato dalla pagina 3 porta a ?stato=richiamare, senza pagina (AC10, AC17)", async () => {
    const { user } = renderBar({ ...defaultState, page: 3 })

    await user.click(screen.getByRole("button", { name: "Stato" }))
    await user.click(screen.getByRole("checkbox", { name: "richiamare" }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=richiamare"
    )
    // The click shows at once, before the list answers
    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()
  })

  it("offre tutti gli stati", async () => {
    const { user } = renderBar()

    await user.click(screen.getByRole("button", { name: "Stato" }))

    expect(screen.getAllByRole("checkbox")).toHaveLength(8)
  })

  it("filtra per operatore, con 'Non assegnato' fra le voci", async () => {
    const { user } = renderBar()

    await user.click(screen.getByRole("button", { name: "Operatore" }))
    await user.click(screen.getByRole("checkbox", { name: "Mario Rossi" }))
    await user.click(screen.getByRole("checkbox", { name: "Non assegnato" }))

    expect(mocks.push).toHaveBeenLastCalledWith(
      "/dashboard/contatti?operatore=0,7"
    )
  })

  it("filtra per fascia di priorità", async () => {
    const { user } = renderBar()

    await user.click(screen.getByRole("button", { name: "Priorità" }))
    expect(screen.getAllByRole("checkbox")).toHaveLength(4)
    await user.click(screen.getByRole("checkbox", { name: "Bassa" }))
    await user.click(screen.getByRole("checkbox", { name: "Urgente" }))

    expect(mocks.push).toHaveBeenLastCalledWith(
      "/dashboard/contatti?priorita=bassa,urgente"
    )
  })

  it("mostra solo i filtri che il link applica davvero (AC18)", async () => {
    const state = parse({
      stato: "inesistente,chiamare",
      operatore: "abc",
      dal: "2026-10-10",
      al: "2026-10-01",
      priorita: "enorme",
    })

    const { user } = renderBar(state)

    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Operatore" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Priorità" })).toBeTruthy()
    await openAdvanced(user)
    expect(screen.getByLabelText<HTMLInputElement>("Dal").value).toBe("")
    expect(screen.getByLabelText<HTMLInputElement>("Al").value).toBe("")
  })

  describe("ricerca cliente", () => {
    it("mostra il testo subito e cambia l'indirizzo una sola volta, dopo 300 ms, con replace", async () => {
      renderBar({ ...defaultState, page: 2 })
      const search = screen.getByRole<HTMLInputElement>("searchbox", {
        name: "Cerca cliente",
      })

      fireEvent.change(search, { target: { value: "ro" } })
      fireEvent.change(search, { target: { value: "ros" } })

      expect(search.value).toBe("ros")
      expect(mocks.replace).not.toHaveBeenCalled()
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1), {
        timeout: 1500,
      })
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/contatti?q=ros")
      expect(mocks.push).not.toHaveBeenCalled()
    })

    it("parte dal testo dell'indirizzo", () => {
      renderBar({ ...defaultState, q: "rossi" })

      expect(
        screen.getByRole<HTMLInputElement>("searchbox", {
          name: "Cerca cliente",
        }).value
      ).toBe("rossi")
    })
  })

  describe("data", () => {
    it("filtra dal e al su un campo a scelta, con un campo data per estremo (AC10)", async () => {
      const { user } = renderBar()
      await openAdvanced(user)

      const from = screen.getByLabelText<HTMLInputElement>("Dal")
      const to = screen.getByLabelText<HTMLInputElement>("Al")
      expect(from.type).toBe("date")
      expect(to.type).toBe("date")

      fireEvent.change(from, { target: { value: "2026-10-01" } })
      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?dal=2026-10-01"
      )
      fireEvent.change(to, { target: { value: "2026-10-15" } })
      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?dal=2026-10-01&al=2026-10-15"
      )
    })

    it("sceglie il campo della data: Contattato il, Prossimo alert o Creato", async () => {
      const { user } = renderBar({ ...defaultState, from: "2026-10-01" })
      await openAdvanced(user)

      await user.click(screen.getByRole("combobox", { name: "Campo data" }))
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Contattato il", "Prossimo alert", "Creato"])
      await user.click(screen.getByRole("option", { name: "Prossimo alert" }))

      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?data=alert&dal=2026-10-01"
      )
    })

    it("svuotare un estremo toglie il filtro", async () => {
      const { user } = renderBar({
        ...defaultState,
        from: "2026-10-01",
        to: "2026-10-15",
      })
      await openAdvanced(user)

      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Dal"), {
        target: { value: "" },
      })

      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?al=2026-10-15"
      )
    })

    it("con 'dal' dopo 'al' non applica niente e lo dice (AC18)", async () => {
      const { user } = renderBar({
        ...defaultState,
        from: "2026-10-01",
        to: "2026-10-10",
      })
      await openAdvanced(user)

      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Dal"), {
        target: { value: "2026-10-20" },
      })

      expect(mocks.push).not.toHaveBeenCalled()
      expect(
        screen.getByText("La data iniziale è dopo quella finale")
      ).toBeTruthy()
      expect(
        screen
          .getByLabelText<HTMLInputElement>("Dal")
          .getAttribute("aria-invalid")
      ).toBe("true")
    })
  })

  describe("un giorno che il server non prende (M7)", () => {
    it("un anno a due cifre si vede e lo dice, ma non blocca gli altri filtri né la ricerca", async () => {
      const { user } = renderBar()
      await openAdvanced(user)
      const from = screen.getByLabelText<HTMLInputElement>("Dal")

      fireEvent.change(from, { target: { value: "0026-10-01" } })

      expect(mocks.push).not.toHaveBeenCalled()
      expect(from.value).toBe("0026-10-01")
      expect(from.getAttribute("aria-invalid")).toBe("true")
      expect(
        screen.getByText("Usa una data tra il 2000 e il 2100")
      ).toBeTruthy()

      await user.click(screen.getByRole("switch", { name: "Con alert" }))
      expect(mocks.push).toHaveBeenLastCalledWith("/dashboard/contatti?alert=1")
      // What the reader typed is still there, and so is the message
      expect(from.value).toBe("0026-10-01")
      expect(
        screen.getByText("Usa una data tra il 2000 e il 2100")
      ).toBeTruthy()
    })

    it("la regione dell'avviso c'è già, vuota, prima dell'errore: un avviso che arriva insieme al suo testo non è detto in modo affidabile", async () => {
      const { user } = renderBar()
      await openAdvanced(user)
      const region = screen.getByRole("alert")
      expect(region.textContent).toBe("")

      fireEvent.change(screen.getByLabelText("Dal"), {
        target: { value: "0026-10-01" },
      })

      // The same node, now with the text
      expect(screen.getByRole("alert")).toBe(region)
      expect(region.textContent).toBe("Usa una data tra il 2000 e il 2100")
    })

    it("il messaggio sparisce quando il giorno è uno che il server prende", async () => {
      const { user } = renderBar()
      await openAdvanced(user)
      const from = screen.getByLabelText<HTMLInputElement>("Dal")
      fireEvent.change(from, { target: { value: "0026-10-01" } })

      fireEvent.change(from, { target: { value: "2026-10-01" } })

      expect(
        screen.queryByText("Usa una data tra il 2000 e il 2100")
      ).toBeNull()
      expect(from.getAttribute("aria-invalid")).toBeNull()
      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?dal=2026-10-01"
      )
    })

    it("con 'dal' dopo 'al' gli altri filtri passano e l'indirizzo tiene l'intervallo che aveva", async () => {
      const { user } = renderBar({
        ...defaultState,
        from: "2026-10-01",
        to: "2026-10-10",
      })
      await openAdvanced(user)
      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Dal"), {
        target: { value: "2026-10-20" },
      })

      // Clicking outside closes the panel: the message is not inside it
      await user.click(screen.getByRole("switch", { name: "Solo i miei" }))

      expect(mocks.push).toHaveBeenLastCalledWith(
        "/dashboard/contatti?dal=2026-10-01&al=2026-10-10&miei=1"
      )
      expect(
        screen.getByText("La data iniziale è dopo quella finale")
      ).toBeTruthy()
    })
  })

  it("segue un nuovo indirizzo (un link, 'Indietro')", () => {
    const view = renderBar({ ...defaultState, states: ["chiamare"] })
    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()

    rerenderBar(view, defaultState)

    expect(screen.getByRole("button", { name: "Stato" })).toBeTruthy()
  })
})

describe("il focus del pannello dei Filtri Avanzati (P17)", () => {
  it("Esc chiude il pannello e riporta il focus sul pulsante, non su body", async () => {
    const { user } = renderBar()
    const trigger = screen.getByRole("button", { name: /^Filtri Avanzati/ })

    await user.click(trigger)
    expect(screen.getByRole("switch", { name: "Con alert" })).toBeTruthy()
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("switch", { name: "Con alert" })).toBeNull()
    )
    expect(document.activeElement).toBe(trigger)
  })

  it("dopo aver cambiato un interruttore, Esc riporta il focus sul pulsante, che ora conta un filtro", async () => {
    const { user } = renderBar()
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("switch", { name: "Con alert" })).toBeNull()
    )
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Filtri Avanzati/ })
    )
  })
})
