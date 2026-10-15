import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TableFilterSection } from "../TableFilterSection"

// Il campo di ricerca e il badge della pagina Pratiche mentre l'URL cambia
// senza rimontare la pagina

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
}))
vi.mock("@/components/custom/table/PopoverFilter", () => ({
  PopoverDateFilter: () => null,
}))

afterEach(() => cleanup())

async function mount(href: string) {
  navigate(href)
  const view = render(<TableFilterSection allColumns={[]} />)
  await act(async () => undefined)
  const rerender = async () => {
    view.rerender(<TableFilterSection allColumns={[]} />)
    await act(async () => undefined)
  }
  return {
    // Back, avanti e i push del router cambiano l'URL senza rimontare
    goTo: async (href: string) => {
      navigate(href)
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
    shown: () => ({
      badge:
        view.container.querySelector(".badge-with-close")?.textContent ?? null,
      input: (view.getByRole("textbox") as HTMLInputElement).value,
    }),
  }
}

describe("TableFilterSection, ricerca", () => {
  it("con back e avanti segue l'URL", async () => {
    const page = await mount("/dashboard/pratiche?q=PR-1&search_by=praticaId")
    expect(page.shown()).toEqual({ badge: "ID Pratica: PR-1", input: "PR-1" })
    await page.goTo("/dashboard/pratiche?q=PR-2&search_by=praticaId")
    expect(page.shown()).toEqual({ badge: "ID Pratica: PR-2", input: "PR-2" })
    await page.goTo("/dashboard/pratiche")
    expect(page.shown()).toEqual({ badge: null, input: "" })
  })

  it("cerca dal campo e si toglie dal badge", async () => {
    const page = await mount("/dashboard/pratiche")
    await page.submit("PR-7")
    expect(nav.params.get("q")).toBe("PR-7")
    expect(nav.params.get("search_by")).toBe("praticaId")
    expect(page.shown()).toEqual({ badge: "ID Pratica: PR-7", input: "PR-7" })
    await page.clearFromBadge()
    expect(nav.params.get("q")).toBeNull()
    expect(page.shown()).toEqual({ badge: null, input: "" })
  })
})
