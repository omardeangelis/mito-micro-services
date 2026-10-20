import React from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TableFilterSections } from "../TableFilterSections"
import {
  CUSTOMER_FILTER_MAP,
  CUSTOMER_FILTER_QUERY_MAP,
} from "../../_constants"

// Il selettore "Cerca per", il campo di ricerca e il badge della pagina
// Clienti mentre l'URL cambia senza rimontare la pagina

const popover = vi.hoisted(() => ({
  // La mappa che il pannello passa al popover dei filtri avanzati
  filterMap: undefined as Map<string, unknown> | undefined,
}))

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  // Una navigazione di Next non ancora arrivata: il push non cambia l'URL
  holdPush: false,
}))

function navigate(href: string) {
  window.history.pushState(null, "", href)
  nav.params = new URLSearchParams(window.location.search)
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({
    push: (href: string) => {
      if (!nav.holdPush) navigate(href)
    },
  }),
}))

// Filtri che caricano dati e non c'entrano con la ricerca
vi.mock("@/components/custom/table/CustomFilters", () => ({
  FileCombobox: () => null,
  OperatorSelector: () => null,
  SedeSelector: () => null,
  // Un segno visibile: se il pannello lo mostra, il test lo vede
  TaskStatusSelector: () => <div data-testid="task-status-selector" />,
}))
vi.mock("@/components/custom/table/PopoverFilter", () => ({
  PopoverDateFilter: ({ filterMap }: { filterMap: Map<string, unknown> }) => {
    popover.filterMap = filterMap
    return null
  },
}))

// Il Select di Radix non si apre in jsdom: ogni voce è un bottone. Come
// Radix, scegliere la voce già selezionata (`value`) non chiama
// `onValueChange`.
vi.mock("@/components/ui/select", async () => {
  const { createContext, useContext } = await import("react")
  type Controlled = { value: string; onValueChange: (value: string) => void }
  const SelectState = createContext<Controlled>({
    value: "",
    onValueChange: () => undefined,
  })
  type Props = { children?: React.ReactNode }
  return {
    Select: ({ value, onValueChange, children }: Props & Controlled) => (
      <SelectState.Provider value={{ value, onValueChange }}>
        {children}
      </SelectState.Provider>
    ),
    SelectTrigger: ({ children }: Props) => (
      <div data-testid="trigger">{children}</div>
    ),
    SelectValue: ({ children }: Props) => <>{children}</>,
    SelectContent: ({ children }: Props) => <>{children}</>,
    SelectGroup: ({ children }: Props) => <>{children}</>,
    SelectLabel: ({ children }: Props) => <>{children}</>,
    SelectItem: ({ value, children }: Props & { value: string }) => {
      const select = useContext(SelectState)
      return (
        <button
          type="button"
          onClick={() => {
            if (value !== select.value) select.onValueChange(value)
          }}
        >
          {children}
        </button>
      )
    },
  }
})

afterEach(() => {
  cleanup()
  nav.holdPush = false
})

async function mount(href: string) {
  navigate(href)
  const view = render(<TableFilterSections allColumns={[]} />)
  await act(async () => undefined)
  const rerender = async () => {
    view.rerender(<TableFilterSections allColumns={[]} />)
    await act(async () => undefined)
  }
  return {
    // Back, avanti e i push del router cambiano l'URL senza rimontare
    goTo: async (href: string) => {
      navigate(href)
      await rerender()
    },
    pick: async (label: string) => {
      fireEvent.click(view.getByRole("button", { name: label }))
      await rerender()
    },
    submit: async (text: string) => {
      fireEvent.change(view.getByRole("textbox"), { target: { value: text } })
      await act(async () => {
        fireEvent.submit(view.container.querySelector("form")!)
      })
      await rerender()
    },
    clearFromBadge: async () => {
      fireEvent.click(view.container.querySelector(".badge-with-close")!)
      await rerender()
    },
    text: () => view.container.textContent ?? "",
    has: (testId: string) => view.queryByTestId(testId) !== null,
    canSearch: () =>
      !(view.getByRole("button", { name: "Cerca" }) as HTMLButtonElement)
        .disabled,
    shown: () => ({
      badge:
        view.container.querySelector(".badge-with-close")?.textContent ?? null,
      trigger: view.getByTestId("trigger").textContent,
      input: (view.getByRole("textbox") as HTMLInputElement).value,
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
    expect(nav.params.get("q")).toBeNull()
    expect(nav.params.get("search_by")).toBeNull()
    expect(page.shown()).toMatchObject({ badge: null, input: "" })
  })

  it("scegliere la voce già attiva non toglie la ricerca", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    await page.pick("Comune")
    expect(nav.params.get("q")).toBe("Roma")
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
    expect(nav.params.get("search_by")).toBe("email")
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

  it("finché l'URL non cambia il badge resta sulla ricerca in corso", async () => {
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
    nav.holdPush = true
    await page.pick("Email")
    expect(page.shown()).toMatchObject({
      badge: "Comune: Roma",
      trigger: "Email",
    })
  })
})

// Filtri tolti da Clienti (AC59, AC60): lo stato e "Contattato il" vivono ora
// in Contatti

describe("TableFilterSections, filtri tolti", () => {
  it("non offre il filtro per stato", async () => {
    const page = await mount("/dashboard/customers")
    expect(page.has("task-status-selector")).toBe(false)
  })

  it("il popover dei filtri avanzati non ha 'Stato' né 'Contattato il'", async () => {
    await mount("/dashboard/customers")
    expect([...popover.filterMap!.keys()]).not.toContain("Stato")
    expect([...popover.filterMap!.keys()]).not.toContain("Contattato il")
    expect([...popover.filterMap!.keys()]).toContain("Comune")
  })

  it("la mappa dei filtri di Clienti ha solo colonne del cliente", () => {
    for (const label of ["Stato", "Contattato il"]) {
      expect(CUSTOMER_FILTER_MAP.has(label)).toBe(false)
    }
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
