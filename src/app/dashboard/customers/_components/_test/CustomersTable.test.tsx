import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomersTable } from "../CustomersTable"
import {
  CustomerColumns,
  type CustomerColumnSelectedProps,
} from "../CustomerColumns"

// L'ordinamento della tabella Clienti nasce dall'URL e lo riscrive nell'URL:
// una colonna tolta (`contattato`, `priority`) o che non c'è conta come
// assente e dà l'ordinamento di default, per ultima modifica (AC59, AC60)

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: vi.fn<(href: string) => void>(), refresh: vi.fn() },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
}))

// Una server action: tira dentro il runtime di Next
vi.mock("../../_actions/handleCustomerBlackList", () => ({
  handleCustomerBlackList: vi.fn(),
}))

vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    select: (state: Record<string, unknown>) => unknown
  ) =>
    select({
      role: "ADMIN",
      setCustomerTableVisibleColumns: () => undefined,
    }),
}))

// Il resto della pagina ha i suoi test
vi.mock("../TableFilterSections", () => ({ TableFilterSections: () => null }))
vi.mock("../CustomerBulkDialog", () => ({ CustomerBulkDialog: () => null }))
vi.mock("@/components/custom/table/TablePagination", () => ({
  TablePagination: () => null,
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

const customer = {
  id: "customer-1",
  name: "Mario",
  surname: "Rossi",
  fiscalCode: "RSSMRA80A01H501U",
  blackListStatus: "whitelisted",
  signedPractices: 0,
  createdAt: new Date("2026-01-10T10:00:00Z"),
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
  tasks: null,
} as unknown as CustomerColumnSelectedProps

/** L'indirizzo dell'ultima navigazione che la tabella ha chiesto. */
const lastPush = () => {
  const href = nav.router.push.mock.calls.at(-1)![0]
  return new URL(href).searchParams
}

function mount(search: string, defaultColumns?: Record<string, boolean>) {
  window.history.replaceState(null, "", `/dashboard/customers${search}`)
  nav.params = new URLSearchParams(search)
  return render(
    <CustomersTable
      columns={CustomerColumns}
      data={[customer]}
      total={1}
      defaultColumns={defaultColumns}
    />
  )
}

beforeEach(() => {
  nav.router.push.mockClear()
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("CustomersTable, ordinamento", () => {
  it("senza ordinamento nell'URL ordina per ultima modifica, dalla più recente", () => {
    mount("")

    expect(lastPush().get("order_by")).toBe("updatedAt")
    expect(lastPush().get("sorted_by")).toBe("desc")
  })

  it.each([
    ["?order_by=contattato&sorted_by=asc"],
    ["?order_by=priority&sorted_by=asc"],
    ["?order_by=priority"],
    ["?order_by=colonnachenonc'e&sorted_by=asc"],
    // A list of columns with one that is gone: the whole sort is the default
    ["?order_by=name,priority&sorted_by=asc,desc"],
    ["?order_by=contattato,name&sorted_by=asc,asc"],
  ])(
    "con %s riparte dal default e non riscrive i parametri tolti",
    (search) => {
      mount(search)

      expect(lastPush().get("order_by")).toBe("updatedAt")
      expect(lastPush().get("sorted_by")).toBe("desc")
    }
  )

  it("un ordinamento che esiste resta, con la sua direzione", () => {
    mount("?order_by=name&sorted_by=asc")

    expect(lastPush().get("order_by")).toBe("name")
    expect(lastPush().get("sorted_by")).toBe("asc")
  })
})

describe("CustomersTable, colonne tolte", () => {
  it("non ha più 'Stato Chiamate', 'Contattato il' e 'Priorità'", () => {
    mount("")

    for (const header of ["Chiamate", "Contattato il", "Priorità"]) {
      expect(screen.queryByText(header)).toBeNull()
    }
    // La tabella c'è: le colonne rimaste si vedono
    expect(screen.getByText("Nome")).not.toBeNull()
  })

  it("una preferenza che nomina una colonna tolta non rompe e non svuota la tabella", () => {
    mount("", { "Stato Chiamate": false, "Contattato il": false, Sede: false })

    expect(screen.getByText("Nome")).not.toBeNull()
    expect(screen.getByText("Mario")).not.toBeNull()
    expect(screen.queryByText("Sede")).toBeNull()
  })
})
