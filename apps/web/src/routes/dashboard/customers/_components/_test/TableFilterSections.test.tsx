import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { fakeCustomers } from "@/test/customers"
import { currentParams, renderCustomers } from "../../_test/page"
import {
  CUSTOMER_FILTER_MAP,
  CUSTOMER_FILTER_QUERY_MAP,
} from "../../_constants"
import { TableFilterSections } from "../TableFilterSections"

// Il selettore "Cerca per", il campo di ricerca e il badge della pagina
// Clienti mentre l'URL cambia senza rimontare la pagina

async function mount(href: string) {
  const user = userEvent.setup()
  const { router, container } = renderCustomers(href, fakeCustomers(), {
    ui: <TableFilterSections allColumns={[]} />,
  })
  // The filters load their options: the operators, the sedi, the files
  await screen.findByRole("combobox", { name: "Cerca per" })
  const trigger = () => screen.getByRole("combobox", { name: "Cerca per" })
  const input = () =>
    screen.getByPlaceholderText<HTMLInputElement>(/^Cerca per/)
  return {
    // Back, avanti e i push del router cambiano l'URL senza rimontare
    goTo: async (href: string) => {
      await act(() => router.navigate(href))
    },
    pick: async (label: string) => {
      await user.click(trigger())
      await user.click(await screen.findByRole("option", { name: label }))
    },
    submit: async (text: string) => {
      await user.clear(input())
      await user.type(input(), text)
      await user.click(screen.getByRole("button", { name: "Cerca" }))
    },
    clearFromBadge: async () => {
      fireEvent.click(container.querySelector(".badge-with-close")!)
      await act(async () => undefined)
    },
    text: () => container.textContent ?? "",
    canSearch: () =>
      !screen.getByRole("button", { name: "Cerca" }).hasAttribute("disabled"),
    shown: () => ({
      badge: container.querySelector(".badge-with-close")?.textContent ?? null,
      trigger: trigger().textContent,
      input: input().value,
    }),
  }
}

describe("TableFilterSections, ricerca", () => {
  it("mostra la ricerca dell'URL", async () => {
    const consoleError = vi.spyOn(console, "error")
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    expect(page.shown()).toEqual({
      badge: "Comune: Roma",
      trigger: "Comune",
      input: "Roma",
    })
    expect(page.canSearch()).toBe(true)
    // Nessun warning di React (es. input da non controllato a controllato)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("il badge toglie la ricerca", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.clearFromBadge()
    expect(currentParams().get("q")).toBeNull()
    expect(currentParams().get("search_by")).toBeNull()
    expect(page.shown()).toMatchObject({ badge: null, input: "" })
  })

  it("scegliere la voce già attiva non toglie la ricerca", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.pick("Comune")
    expect(currentParams().get("q")).toBe("Roma")
    expect(page.shown()).toEqual({
      badge: "Comune: Roma",
      trigger: "Comune",
      input: "Roma",
    })
  })

  it("con un search_by sconosciuto mostra il codice fiscale", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=address")
    expect(page.shown()).toMatchObject({
      badge: "Codice Fiscale: Roma",
      trigger: "Codice Fiscale",
    })
  })

  it("con back e avanti segue l'URL", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.goTo("/dashboard/customers?q=Bianchi&search_by=surname")
    expect(page.shown()).toEqual({
      badge: "Cognome: Bianchi",
      trigger: "Cognome",
      input: "Bianchi",
    })
    await page.goTo("/dashboard/customers")
    expect(page.shown()).toMatchObject({ badge: null, input: "" })
  })

  it("cambiare voce toglie la ricerca e cerca nel nuovo campo", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.pick("Email")
    expect(page.shown()).toEqual({ badge: null, trigger: "Email", input: "" })
    expect(page.canSearch()).toBe(true)
    await page.submit("rossi@")
    expect(currentParams().get("search_by")).toBe("email")
    expect(currentParams().get("q")).toBe("rossi@")
    await waitFor(() =>
      expect(page.shown()).toMatchObject({ badge: "Email: rossi@" })
    )
    expect(page.shown()).toEqual({
      badge: "Email: rossi@",
      trigger: "Email",
      input: "rossi@",
    })
  })

  it("con back e avanti sullo stesso campo segue il testo", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.goTo("/dashboard/customers?q=Milano&search_by=comune")
    expect(page.shown()).toEqual({
      badge: "Comune: Milano",
      trigger: "Comune",
      input: "Milano",
    })
  })

  it("si possono scegliere due voci di fila", async () => {
    const page = await mount("/dashboard/customers")
    await page.pick("Email")
    expect(page.shown()).toMatchObject({ trigger: "Email" })
    await page.pick("Codice Fiscale")
    expect(page.shown()).toMatchObject({ trigger: "Codice Fiscale" })
  })
})

describe("TableFilterSections, filtri", () => {
  it("scegliere una sede la aggiunge a filter_by e mostra il suo chip", async () => {
    const user = userEvent.setup()
    const page = await mount("/dashboard/customers?filter_by=[sede]=Roma")

    // The trigger reads "Sede" from a <label>, which names no combobox
    await user.click(
      screen
        .getAllByRole("combobox")
        .find((combobox) => combobox.textContent === "Sede")!
    )
    // The sede already in the filter is not offered again
    expect(screen.queryByRole("option", { name: "Roma" })).toBeNull()
    await user.click(await screen.findByRole("option", { name: "Milano" }))

    await waitFor(() =>
      expect(currentParams().get("filter_by")).toBe(
        encodeURIComponent("[sede]=Roma-Milano")
      )
    )
    expect(page.text()).toContain("Milano")
  })
})

// Filtri tolti da Clienti (AC59, AC60): lo stato e "Contattato il" vivono ora
// in Contatti

describe("TableFilterSections, filtri tolti", () => {
  it("la mappa dei filtri avanzati di Clienti ha solo colonne del cliente", () => {
    for (const label of ["Stato", "Contattato il"]) {
      expect(CUSTOMER_FILTER_MAP.has(label)).toBe(false)
    }
    expect(CUSTOMER_FILTER_MAP.has("Comune")).toBe(true)
    for (const column of ["state", "closed_at"]) {
      expect(CUSTOMER_FILTER_QUERY_MAP.has(column)).toBe(false)
    }
    expect(CUSTOMER_FILTER_QUERY_MAP.has("comune")).toBe(true)
  })

  it("un link salvato con filter_by=[status]=chiamare non mostra il chip 'chiamare'", async () => {
    const page = await mount(
      "/dashboard/customers?filter_by=%5Bstatus%5D%3Dchiamare%2C%5Bsede%5D%3DRoma"
    )
    // Il chip della sede resta: il test non è vuoto
    expect(page.text()).toContain("Roma")
    expect(page.text()).not.toContain("chiamare")
  })
})
