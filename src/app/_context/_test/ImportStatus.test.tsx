import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { type TRPCLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { type ReactNode, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type AppRouter } from "@mito/server/api/root"
import { type ImportSummary } from "@/app/dashboard/import/_components/format"
import { Toaster } from "@/components/ui/toaster"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { api } from "@/trpc/react"
import { transformer } from "@/trpc/shared"
import { ImportStatusProvider, useImportStatus } from "../ImportStatus"

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

const run = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
  id: 7,
  startedAt: new Date("2026-10-25T09:05:00Z"),
  finishedAt: null,
  startedBy: "Anna Rossi",
  fileName: "wave_ottobre.xlsx",
  format: "wave",
  status: "running",
  failureReason: null,
  rowsTotal: 120,
  rowsDiscarded: 3,
  customersCreated: null,
  customersUpdated: null,
  practicesCreated: null,
  practicesUpdated: null,
  linksCreated: null,
  durationMs: null,
  ...overrides,
})

const completed = run({
  status: "completed",
  finishedAt: new Date("2026-10-25T09:05:12Z"),
  durationMs: 12_000,
  customersCreated: 40,
  customersUpdated: 12_000,
  practicesCreated: 50,
  practicesUpdated: 67,
  linksCreated: 90,
})

// What the server answers, by procedure: `active` is whatever the test says
// the latest import is now
let active: ImportSummary | null = null
let calls: string[] = []

const serverLink: TRPCLink<AppRouter> =
  () =>
  ({ op }) =>
    observable((observer) => {
      calls.push(op.path)
      const data =
        op.path === "import.active"
          ? active
          : op.path === "import.list"
            ? { imports: [], total: 0 }
            : []
      observer.next({ result: { type: "data", data } })
      observer.complete()
    })

/** The lists that show the data of an import: the history and the "File" filter. */
function Lists() {
  api.import.list.useQuery({ page: 1 })
  api.customer.getAllFileName.useQuery("customers")
  api.customer.getAllFileName.useQuery("practices")
  return null
}

let started: (runId: number) => void

function StartButton() {
  started = useImportStatus().watch
  return null
}

function Harness({
  role,
  children,
}: {
  role: "ADMIN" | "OPERATORE"
  children: ReactNode
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  )
  const [client] = useState(() =>
    api.createClient({ transformer, links: [serverLink] })
  )
  const [store] = useState(() =>
    createUserPreferenceStore({ preferences: undefined, role, operatorId: 1 })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={client} queryClient={queryClient}>
        <UserPreferenceContext.Provider value={store}>
          <ImportStatusProvider>{children}</ImportStatusProvider>
        </UserPreferenceContext.Provider>
        <Toaster />
      </api.Provider>
    </QueryClientProvider>
  )
}

const renderStatus = (role: "ADMIN" | "OPERATORE" = "ADMIN") =>
  render(
    <Harness role={role}>
      <Lists />
      <StartButton />
    </Harness>
  )

/** Lets the timers and the answers of the queries run: a poll every 3 s, answered at once. */
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const asked = (path: string) => calls.filter((call) => call === path).length

beforeEach(() => {
  vi.useFakeTimers()
  active = null
  calls = []
  mocks.refresh.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ImportStatusProvider", () => {
  it("tells the admin how the import ended and refreshes the lists (AC21, AC26)", async () => {
    active = run()
    renderStatus()
    await wait(0)
    expect(asked("import.active")).toBe(1)
    const lists = asked("import.list")
    const files = asked("customer.getAllFileName")

    await wait(3500)
    expect(asked("import.active")).toBe(2)
    expect(screen.queryByText("Import completato")).toBeNull()

    active = completed
    await wait(3500)

    expect(screen.getByText("Import completato")).toBeTruthy()
    expect(
      screen.getByText(
        "wave_ottobre.xlsx: 40 clienti nuovi e 12.000 aggiornati, 50 pratiche nuove e 67 aggiornate, 90 legami nuovi"
      )
    ).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(asked("import.list")).toBe(lists + 1)
    expect(asked("customer.getAllFileName")).toBe(files + 2)

    // Once it ended, nobody asks again
    await wait(30_000)
    expect(asked("import.active")).toBe(3)
  })

  it("a screen reader hears the notice in Italian, with its words apart (AC40, AC41)", async () => {
    // Radix writes the announcement a frame after the toast, and takes it
    // away a second later
    vi.useRealTimers()
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    })
    active = run()
    renderStatus()
    await wait(0)

    active = completed
    await wait(3100)
    // The two frames after the toast
    await wait(50)

    expect(screen.getByRole("status").textContent).toBe(
      "Notifica Import completato wave_ottobre.xlsx: 40 clienti nuovi e 12.000 aggiornati, 50 pratiche nuove e 67 aggiornate, 90 legami nuovi"
    )
    expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(
      /^Notifiche \(/
    )
  })

  it("says why an import failed, without refreshing what it didn't write (AC29)", async () => {
    active = run()
    renderStatus()
    await wait(0)
    const files = asked("customer.getAllFileName")

    active = run({
      status: "failed",
      failureReason: "Errore del database (codice 40001)",
    })
    await wait(3500)

    expect(screen.getByText("Import fallito")).toBeTruthy()
    expect(
      screen.getByText("wave_ottobre.xlsx: Errore del database (codice 40001)")
    ).toBeTruthy()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(asked("customer.getAllFileName")).toBe(files)
  })

  it("says an import past its time was interrupted (AC30)", async () => {
    active = run()
    renderStatus()
    await wait(0)

    active = run({
      status: "interrupted",
      failureReason: "L'import non è finito entro 30 minuti dall'inizio",
    })
    await wait(3500)

    expect(screen.getByText("Import interrotto")).toBeTruthy()
  })

  it("follows an import that ends before the first ask", async () => {
    active = null
    renderStatus()
    await wait(0)

    active = completed
    act(() => started(completed.id))
    await wait(0)

    expect(screen.getByText("Import completato")).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("says nothing of an import that ended before the page opened", async () => {
    active = completed
    renderStatus()
    await wait(0)
    await wait(30_000)

    expect(asked("import.active")).toBe(1)
    expect(screen.queryByText("Import completato")).toBeNull()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("never asks for an operator (AC1)", async () => {
    active = run()
    renderStatus("OPERATORE")
    await wait(30_000)

    expect(asked("import.active")).toBe(0)
  })
})
