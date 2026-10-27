import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import {
  CUSTOMER_FILTER_MAP,
  PRATICA_FILTER_MAP,
} from "@mito/domain/filters/advanced"
import { PopoverDateFilter } from "../PopoverFilter"

// Il popover dei filtri avanzati legge `filter` dall'URL del browser da solo,
// non dal risultato del server: un link salvato con una colonna che la mappa
// non conosce (la colonna di un filtro tolto, un parametro malformato) non
// deve far cadere la pagina (AC60)

const router = { push: vi.fn() }
vi.mock("@/lib/navigation", () => ({ useRouter: () => router }))

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

// Gli operatori offerti per tipo di colonna e la forma `nome:op:valore` che
// il popover scrive nell'URL restano quelli di prima (AC6, AC9), con le
// mappe vere di Clienti e Pratiche

const operatorOptions = async (
  filterMap: Map<string, PgColumn>,
  filter: string
) => {
  await openPopover(filterMap, [filter])
  const user = userEvent.setup()
  // Il secondo selettore della riga è l'operatore
  const operator = screen.getAllByRole("combobox")[1]!
  await user.click(operator)
  const options = screen.getAllByRole("option").map((o) => o.textContent)
  await user.keyboard("{Escape}")
  return options
}

describe("PopoverDateFilter, operatori per tipo di colonna", () => {
  const ALL = ["=", ">", "<", ">=", "<="]

  it.each([
    ["Rata, un importo", "importo_rata:gt:150", ALL],
    ["Rate pagate, un intero", "rate_pagate:gte:10", ALL],
    ["Liquidato il, una data", "data_liquidazione:gte:2026-01-01", ALL],
    ["Regione, un testo", "region:eq:Lazio", ["="]],
    ["Stato, un enum", "state:eq:Liquidata", ["="]],
  ])("in Pratiche %s offre %j", async (_name, filter, expected) => {
    expect(await operatorOptions(PRATICA_FILTER_MAP, filter)).toEqual(expected)
  })

  it.each([
    ["Età, un intero", "age:gte:40", ALL],
    ["Compleanno, una data", "birthday_date:lt:1980-01-01", ALL],
    ["Comune, un testo", "comune:eq:Roma", ["="]],
    ["Fonte, un enum", "source:eq:inbound", ["="]],
  ])("in Clienti %s offre %j", async (_name, filter, expected) => {
    expect(await operatorOptions(CUSTOMER_FILTER_MAP, filter)).toEqual(expected)
  })
})

describe("PopoverDateFilter, controllo del valore per tipo di colonna", () => {
  it("su un enum il valore è un selettore, non un campo di testo", async () => {
    await openPopover(PRATICA_FILTER_MAP, ["state:eq:Liquidata"])
    // Colonna, operatore e valore
    expect(screen.getAllByRole("combobox")).toHaveLength(3)
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("su una data il campo ha il segnaposto aaaa-mm-gg, su un testo no", async () => {
    await openPopover(CUSTOMER_FILTER_MAP, ["birthday_date:lt:1980-01-01"])
    expect(screen.getByPlaceholderText("aaaa-mm-gg")).toBeTruthy()
    cleanup()

    await openPopover(CUSTOMER_FILTER_MAP, ["comune:eq:Roma"])
    expect(screen.getByRole("textbox")).toBeTruthy()
    expect(screen.queryByPlaceholderText("aaaa-mm-gg")).toBeNull()
  })
})

describe("PopoverDateFilter, filtri scritti nell'URL", () => {
  it("scrive nome:op:valore, con la data completata degli zeri", async () => {
    router.push.mockClear()
    await openPopover(PRATICA_FILTER_MAP, [
      "importo_rata:gt:150",
      "data_liquidazione:gte:2026-1-5",
      "region:eq:Lazio",
    ])
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Applica" }))

    const [pushed] = router.push.mock.calls.at(-1) as [string]
    expect(new URL(pushed).searchParams.getAll("filter")).toEqual([
      "importo_rata:gt:150",
      "data_liquidazione:gte:2026-01-05",
      "region:eq:Lazio",
    ])
  })

  it("una data non valida resta fuori dall'URL", async () => {
    router.push.mockClear()
    await openPopover(CUSTOMER_FILTER_MAP, [
      "birthday_date:lt:2026-13-01",
      "comune:eq:Roma",
    ])
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Applica" }))

    const [pushed] = router.push.mock.calls.at(-1) as [string]
    expect(new URL(pushed).searchParams.getAll("filter")).toEqual([
      "comune:eq:Roma",
    ])
  })
})
