import React from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TableFilterSections } from "../TableFilterSections"

// Il selettore "Cerca per", il campo di ricerca e il badge della pagina
// Clienti mentre l'URL cambia senza rimontare la pagina

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))

function navigate(href: string) {
  window.history.pushState(null, "", href)
  nav.params = new URLSearchParams(window.location.search)
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: navigate }),
}))

// Filtri che caricano dati e non c'entrano con la ricerca
vi.mock("@/components/custom/table/CustomFilters", () => ({
  FileCombobox: () => null,
  OperatorSelector: () => null,
  SedeSelector: () => null,
  TaskStatusSelector: () => null,
}))
vi.mock("@/components/custom/table/PopoverFilter", () => ({
  PopoverDateFilter: () => null,
}))

// Il Select di Radix non si apre in jsdom: ogni voce è un bottone
vi.mock("@/components/ui/select", async () => {
  const { createContext, useContext } = await import("react")
  const OnChange = createContext<(value: string) => void>(() => undefined)
  type Props = { children?: React.ReactNode }
  return {
    Select: ({
      onValueChange,
      children,
    }: Props & { onValueChange: (value: string) => void }) => (
      <OnChange.Provider value={onValueChange}>{children}</OnChange.Provider>
    ),
    SelectTrigger: ({ children }: Props) => (
      <div data-testid="trigger">{children}</div>
    ),
    SelectValue: ({ children }: Props) => <>{children}</>,
    SelectContent: ({ children }: Props) => <>{children}</>,
    SelectGroup: ({ children }: Props) => <>{children}</>,
    SelectLabel: ({ children }: Props) => <>{children}</>,
    SelectItem: ({ value, children }: Props & { value: string }) => {
      const onValueChange = useContext(OnChange)
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      )
    },
  }
})

afterEach(() => cleanup())

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
    const page = await mount("/dashboard/customers?q=Roma&search_by=comune")
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
    await page.submit("rossi@")
    expect(nav.params.get("search_by")).toBe("email")
    expect(page.shown()).toEqual({
      badge: "Email: rossi@",
      trigger: "Email",
      input: "rossi@",
    })
  })
})
