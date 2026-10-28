import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { activeOperator, fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { findTable, renderContacts } from "./page"

// The filters bar of the list, as the tests of `ContactFilters` of the
// Next.js app, on a backend in memory: what the controls show and the
// address they lead to

const operators = [
  activeOperator({ id: 7, name: "Mario", surname: "Rossi" }),
  activeOperator({ id: 9, name: "Giulia", surname: "Bianchi" }),
]

/** The list at `path` (or the address of `state`) */
const renderBar = async (state: ContactsListState | string = defaultState) => {
  const backend = fakeContacts({ operators })
  const view = renderContacts(
    typeof state === "string" ? state : listHref(state),
    backend
  )
  await findTable()
  return view
}

/** The filters bar: the table has a "Priorità" of its own, its order */
const bar = () =>
  within(screen.getByRole("search", { name: "Filtri dei contatti" }))

const openAdvanced = (user: Awaited<ReturnType<typeof renderBar>>["user"]) =>
  user.click(screen.getByRole("button", { name: /^Filtri Avanzati/ }))

/** Waits for `navigation` to be the last one of the list */
const lastNavigationIs = (navigations: string[], navigation: string) =>
  waitFor(() => expect(navigations.at(-1)).toBe(navigation))

describe("la barra dei filtri", () => {
  it("scegliere uno stato dalla pagina 3 porta a ?stato=richiamare, senza pagina (AC10, AC17)", async () => {
    const { user, navigations } = await renderBar({ ...defaultState, page: 3 })

    await user.click(screen.getByRole("button", { name: "Stato" }))
    await user.click(screen.getByRole("checkbox", { name: "richiamare" }))

    // The click shows at once, before the list answers
    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()
    await lastNavigationIs(
      navigations,
      "PUSH /dashboard/contatti?stato=richiamare"
    )
    expect(navigations).toHaveLength(1)
  })

  it("offre tutti gli stati", async () => {
    const { user } = await renderBar()

    await user.click(screen.getByRole("button", { name: "Stato" }))

    expect(screen.getAllByRole("checkbox")).toHaveLength(9)
  })

  it("filtra per operatore, con 'Non assegnato' fra le voci", async () => {
    const { user, navigations } = await renderBar()

    await user.click(screen.getByRole("button", { name: "Operatore" }))
    await user.click(screen.getByRole("checkbox", { name: "Mario Rossi" }))
    await user.click(screen.getByRole("checkbox", { name: "Non assegnato" }))

    await lastNavigationIs(
      navigations,
      "PUSH /dashboard/contatti?operatore=0,7"
    )
  })

  it("filtra per fascia di priorità", async () => {
    const { user, navigations } = await renderBar()

    await user.click(bar().getByRole("button", { name: "Priorità" }))
    expect(screen.getAllByRole("checkbox")).toHaveLength(4)
    await user.click(screen.getByRole("checkbox", { name: "Bassa" }))
    await user.click(screen.getByRole("checkbox", { name: "Urgente" }))

    await lastNavigationIs(
      navigations,
      "PUSH /dashboard/contatti?priorita=bassa,urgente"
    )
  })

  it("mostra solo i filtri che il link applica davvero (AC18)", async () => {
    const { user } = await renderBar(
      "/dashboard/contatti?stato=inesistente,chiamare&operatore=abc&dal=2026-10-10&al=2026-10-01&priorita=enorme"
    )

    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Operatore" })).toBeTruthy()
    expect(bar().getByRole("button", { name: "Priorità" })).toBeTruthy()
    await openAdvanced(user)
    expect(screen.getByLabelText<HTMLInputElement>("Dal").value).toBe("")
    expect(screen.getByLabelText<HTMLInputElement>("Al").value).toBe("")
  })

  describe("ricerca cliente", () => {
    it("mostra il testo subito e cambia l'indirizzo una sola volta, dopo 300 ms, con replace", async () => {
      const { navigations } = await renderBar({ ...defaultState, page: 2 })
      const search = screen.getByRole<HTMLInputElement>("searchbox", {
        name: "Cerca cliente",
      })

      fireEvent.change(search, { target: { value: "ro" } })
      fireEvent.change(search, { target: { value: "ros" } })

      expect(search.value).toBe("ros")
      expect(navigations).toEqual([])
      await waitFor(() => expect(navigations).toHaveLength(1), {
        timeout: 1500,
      })
      expect(navigations).toEqual(["REPLACE /dashboard/contatti?q=ros"])
    })

    it("parte dal testo dell'indirizzo", async () => {
      await renderBar({ ...defaultState, q: "rossi" })

      expect(
        screen.getByRole<HTMLInputElement>("searchbox", {
          name: "Cerca cliente",
        }).value
      ).toBe("rossi")
    })
  })

  describe("data", () => {
    it("filtra dal e al su un campo a scelta, con un campo data per estremo (AC10)", async () => {
      const { user, navigations } = await renderBar()
      await openAdvanced(user)

      const from = screen.getByLabelText<HTMLInputElement>("Dal")
      const to = screen.getByLabelText<HTMLInputElement>("Al")
      expect(from.type).toBe("date")
      expect(to.type).toBe("date")

      fireEvent.change(from, { target: { value: "2026-10-01" } })
      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?dal=2026-10-01"
      )
      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Al"), {
        target: { value: "2026-10-15" },
      })
      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?dal=2026-10-01&al=2026-10-15"
      )
    })

    it("sceglie il campo della data: Contattato il, Prossimo alert o Creato", async () => {
      const { user, navigations } = await renderBar({
        ...defaultState,
        from: "2026-10-01",
      })
      await openAdvanced(user)

      await user.click(screen.getByRole("combobox", { name: "Campo data" }))
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Contattato il", "Prossimo alert", "Creato"])
      await user.click(screen.getByRole("option", { name: "Prossimo alert" }))

      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?data=alert&dal=2026-10-01"
      )
    })

    it("svuotare un estremo toglie il filtro", async () => {
      const { user, navigations } = await renderBar({
        ...defaultState,
        from: "2026-10-01",
        to: "2026-10-15",
      })
      await openAdvanced(user)

      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Dal"), {
        target: { value: "" },
      })

      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?al=2026-10-15"
      )
    })

    it("con 'dal' dopo 'al' non applica niente e lo dice (AC18)", async () => {
      const { user, navigations } = await renderBar({
        ...defaultState,
        from: "2026-10-01",
        to: "2026-10-10",
      })
      await openAdvanced(user)

      fireEvent.change(screen.getByLabelText<HTMLInputElement>("Dal"), {
        target: { value: "2026-10-20" },
      })

      expect(
        screen.getByText("La data iniziale è dopo quella finale")
      ).toBeTruthy()
      expect(
        screen
          .getByLabelText<HTMLInputElement>("Dal")
          .getAttribute("aria-invalid")
      ).toBe("true")
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
      expect(navigations).toEqual([])
    })
  })

  describe("un giorno che il server non prende (M7)", () => {
    it("un anno a due cifre si vede e lo dice, ma non blocca gli altri filtri né la ricerca", async () => {
      const { user, navigations } = await renderBar()
      await openAdvanced(user)
      const from = screen.getByLabelText<HTMLInputElement>("Dal")

      fireEvent.change(from, { target: { value: "0026-10-01" } })

      expect(navigations).toEqual([])
      expect(from.value).toBe("0026-10-01")
      expect(from.getAttribute("aria-invalid")).toBe("true")
      expect(
        screen.getByText("Usa una data tra il 2000 e il 2100")
      ).toBeTruthy()

      await user.click(screen.getByRole("switch", { name: "Con alert" }))
      await lastNavigationIs(navigations, "PUSH /dashboard/contatti?alert=1")
      expect(navigations).toHaveLength(1)
      // What the reader typed is still there, and so is the message
      expect(screen.getByLabelText<HTMLInputElement>("Dal").value).toBe(
        "0026-10-01"
      )
      expect(
        screen.getByText("Usa una data tra il 2000 e il 2100")
      ).toBeTruthy()
    })

    it("la regione dell'avviso c'è già, vuota, prima dell'errore: un avviso che arriva insieme al suo testo non è detto in modo affidabile", async () => {
      const { user } = await renderBar()
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
      const { user, navigations } = await renderBar()
      await openAdvanced(user)
      const from = screen.getByLabelText<HTMLInputElement>("Dal")
      fireEvent.change(from, { target: { value: "0026-10-01" } })

      fireEvent.change(from, { target: { value: "2026-10-01" } })

      expect(
        screen.queryByText("Usa una data tra il 2000 e il 2100")
      ).toBeNull()
      expect(from.getAttribute("aria-invalid")).toBeNull()
      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?dal=2026-10-01"
      )
    })

    it("con 'dal' dopo 'al' gli altri filtri passano e l'indirizzo tiene l'intervallo che aveva", async () => {
      const { user, navigations } = await renderBar({
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

      await lastNavigationIs(
        navigations,
        "PUSH /dashboard/contatti?dal=2026-10-01&al=2026-10-10&miei=1"
      )
      expect(
        screen.getByText("La data iniziale è dopo quella finale")
      ).toBeTruthy()
    })
  })

  it("segue un nuovo indirizzo (un link, 'Indietro')", async () => {
    const { router } = await renderBar({
      ...defaultState,
      states: ["chiamare"],
    })
    expect(
      screen.getByRole("button", { name: "Stato, 1 selezionato" })
    ).toBeTruthy()

    await act(() => router.navigate("/dashboard/contatti"))

    expect(await screen.findByRole("button", { name: "Stato" })).toBeTruthy()
  })
})

describe("il focus del pannello dei Filtri Avanzati (P17)", () => {
  it("Esc chiude il pannello e riporta il focus sul pulsante, non su body", async () => {
    const { user } = await renderBar()
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
    const { user } = await renderBar()
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("switch", { name: "Con alert" })).toBeNull()
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Filtri Avanzati/ })
      )
    )
  })
})
