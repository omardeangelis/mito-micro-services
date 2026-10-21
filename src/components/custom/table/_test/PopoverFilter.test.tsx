import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import { customers } from "@/server/db/schema/customers"
import { practices } from "@/server/db/schema/pratiche"
import { PopoverDateFilter } from "../PopoverFilter"

// Il popover dei filtri avanzati legge `filter` dall'URL del browser da solo,
// non dal risultato del server: un link salvato con una colonna che la mappa
// non conosce (la colonna di un filtro tolto, un parametro malformato) non
// deve far cadere la pagina (AC60)

const router = { push: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { comune, age } = getTableColumns(customers)
const { region, importoRata } = getTableColumns(practices)

// La mappa di Clienti dopo T6.2: solo colonne del cliente
const customerMap = new Map<string, PgColumn>([
  ["Comune", comune],
  ["Età", age],
])
const praticaMap = new Map<string, PgColumn>([
  ["Regione", region],
  ["Rata", importoRata],
])

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

async function openPopover(
  filterMap: Map<string, PgColumn>,
  filters: string[]
) {
  const query = filters.map((f) => `filter=${encodeURIComponent(f)}`).join("&")
  window.history.replaceState(null, "", `/dashboard/customers?${query}`)
  const user = userEvent.setup()
  render(<PopoverDateFilter filterMap={filterMap} />)
  await user.click(screen.getByRole("button", { name: /Filtri Avanzati/ }))
}

const crashed = () => screen.queryByText("Something went wrong.") !== null
const emptyMessage = () => screen.queryByText("Nessun Filtro attivo")

describe("PopoverDateFilter, filtri nell'URL che la mappa non conosce", () => {
  it.each([
    ["lo stato", "state:eq:chiamare"],
    ["'Contattato il'", "closed_at:gte:2026-09-01"],
  ])("con il filtro su %s si apre senza righe", async (_name, filter) => {
    // L'errore di un componente cadrebbe qui nella console
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await openPopover(customerMap, [filter])

    expect(crashed()).toBe(false)
    expect(emptyMessage()).not.toBeNull()
  })

  it("tiene la riga del filtro che esiste e scarta quella che non c'è", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await openPopover(customerMap, [
      "state:eq:chiamare",
      "comune:eq:Roma",
      "closed_at:gte:2026-09-01",
    ])

    expect(crashed()).toBe(false)
    expect(emptyMessage()).toBeNull()
    expect(screen.getAllByDisplayValue("Roma")).toHaveLength(1)
    // Una sola riga di filtro: un solo pulsante per toglierla
    expect(document.querySelectorAll("input")).toHaveLength(1)
  })

  it("un filtro che esiste mostra la sua riga", async () => {
    await openPopover(customerMap, ["comune:eq:Roma"])

    expect(crashed()).toBe(false)
    expect(screen.getByDisplayValue("Roma")).not.toBeNull()
  })

  it("vale anche per la mappa di Pratiche, con un nome ignoto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await openPopover(praticaMap, ["zzz:eq:foo"])

    expect(crashed()).toBe(false)
    expect(emptyMessage()).not.toBeNull()
  })

  it.each([
    ["senza operatore né valore", "comune"],
    ["senza valore", "comune:eq"],
    ["vuoto", ""],
  ])(
    "un filter malformato (%s) non fa cadere la pagina",
    async (_n, filter) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined)
      await openPopover(customerMap, [filter])

      expect(crashed()).toBe(false)
      expect(emptyMessage()).not.toBeNull()
    }
  )
})
