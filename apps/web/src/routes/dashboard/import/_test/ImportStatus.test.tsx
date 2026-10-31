import { useQuery } from "@tanstack/react-query"
import { act, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { customerKeys } from "@/api/customer"
import { useImportList } from "@/api/import"
import { completedRun, fakeImport, importRun } from "@/test/import"
import { useImportStatus } from "../ImportStatus"
import { renderImport } from "./page"

// The notice of an import's end, in any page, on a backend in memory, as the
// tests of `ImportStatusProvider` of the Next.js app. `router.refresh()` of
// the Next.js app is the queries read again: here the "File" filter stands
// for all of them

let fileReads = 0
let started: (runId: number) => void

/** The lists that show the data of an import: the history and the "File" filter */
function Lists() {
  useImportList(1)
  useQuery({
    queryKey: customerKeys.fileNames("customers"),
    queryFn: () => {
      fileReads++
      return []
    },
  })
  started = useImportStatus().watch
  return null
}

const renderStatus = (
  backend: ReturnType<typeof fakeImport>,
  role: "ADMIN" | "OPERATORE" = "ADMIN"
) => renderImport(backend, { role, ui: <Lists /> })

/** Lets the timers and the answers run: a poll every 3 s, answered at once */
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  fileReads = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ImportStatusProvider", () => {
  it("dice all'admin com'è finito l'import e rilegge le liste (AC21, AC26)", async () => {
    const backend = fakeImport({ active: importRun() })
    renderStatus(backend)
    await wait(0)
    expect(backend.asked("active")).toBe(1)
    const lists = backend.asked("list")
    const files = fileReads

    await wait(3500)
    expect(backend.asked("active")).toBe(2)
    expect(screen.queryByText("Import completato")).toBeNull()

    backend.state.active = completedRun
    await wait(3500)

    expect(screen.getByText("Import completato")).toBeTruthy()
    expect(
      screen.getByText(
        "wave_ottobre.xlsx: 40 clienti nuovi e 12.000 aggiornati, 50 pratiche nuove e 67 aggiornate, 90 legami nuovi"
      )
    ).toBeTruthy()
    expect(backend.asked("list")).toBe(lists + 1)
    expect(fileReads).toBe(files + 1)

    // Once it ended, nobody asks again
    await wait(30_000)
    expect(backend.asked("active")).toBe(3)
  })

  it("un lettore di schermo sente l'avviso nella regione educata «Notifiche (F8)», e dopo 10 s non c'è più (AC13, AC30, AC32)", async () => {
    const backend = fakeImport({ active: importRun() })
    renderStatus(backend)
    await wait(0)

    backend.state.active = completedRun
    await wait(3100)

    const region = screen.getByRole("region", { name: "Notifiche (F8)" })
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(within(region).getByText("Import completato")).toBeInTheDocument()
    expect(
      within(region).getByText(
        "wave_ottobre.xlsx: 40 clienti nuovi e 12.000 aggiornati, 50 pratiche nuove e 67 aggiornate, 90 legami nuovi"
      )
    ).toBeInTheDocument()

    // Still there just before its 10 s, gone after them and Sonner's 200 ms
    // exit (D13: the node shown is the one not removed)
    await wait(9500)
    expect(
      within(region)
        .getByText("Import completato")
        .closest("[data-sonner-toast]")
    ).toHaveAttribute("data-removed", "false")
    await wait(500 + 250)
    expect(within(region).queryByText("Import completato")).toBeNull()
  })

  it("dice perché un import è fallito, senza rileggere quello che non ha scritto (AC29)", async () => {
    const backend = fakeImport({ active: importRun() })
    renderStatus(backend)
    await wait(0)
    const lists = backend.asked("list")
    const files = fileReads

    backend.state.active = importRun({
      status: "failed",
      failureReason: "Errore del database (codice 40001)",
    })
    await wait(3500)

    expect(screen.getByText("Import fallito")).toBeTruthy()
    expect(
      screen.getByText("wave_ottobre.xlsx: Errore del database (codice 40001)")
    ).toBeTruthy()
    expect(backend.asked("list")).toBe(lists + 1)
    expect(fileReads).toBe(files)
  })

  it("dice che un import oltre il suo tempo è stato interrotto (AC30)", async () => {
    const backend = fakeImport({ active: importRun() })
    renderStatus(backend)
    await wait(0)

    backend.state.active = importRun({
      status: "interrupted",
      failureReason: "L'import non è finito entro 30 minuti dall'inizio",
    })
    await wait(3500)

    expect(screen.getByText("Import interrotto")).toBeTruthy()
  })

  it("segue un import che finisce prima della prima domanda", async () => {
    const backend = fakeImport()
    renderStatus(backend)
    await wait(0)
    const files = fileReads

    backend.state.active = completedRun
    act(() => started(completedRun.id))
    // Sonner adds the toast after a `setTimeout(0)` of its own
    await wait(10)

    expect(screen.getByText("Import completato")).toBeTruthy()
    expect(fileReads).toBe(files + 1)
  })

  it("non dice niente di un import finito prima che la pagina si aprisse", async () => {
    const backend = fakeImport({ active: completedRun })
    renderStatus(backend)
    await wait(0)
    // Sonner adds a toast after a `setTimeout(0)`: one would be there now (D13)
    await wait(250)

    // Right away: a notice would still be on screen (it lasts 10 s)
    expect(screen.queryByText("Import completato")).toBeNull()
    // The "File" filter read once, when it mounted, and never again
    expect(fileReads).toBe(1)
    await wait(30_000)
    expect(backend.asked("active")).toBe(1)
    expect(fileReads).toBe(1)
  })

  it("una domanda fallita sull'ultimo import non mostra toast: è dietro ogni pagina", async () => {
    const backend = fakeImport({ active: importRun() })
    backend.state.failingActive = true
    renderStatus(backend)
    await wait(30_000)

    expect(backend.asked("active")).toBeGreaterThan(0)
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })

  it("per un operatore non chiede mai (AC1)", async () => {
    const backend = fakeImport({ active: importRun() })
    renderStatus(backend, "OPERATORE")
    await wait(30_000)

    expect(backend.asked("active")).toBe(0)
  })
})
