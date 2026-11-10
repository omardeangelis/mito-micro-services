import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

// The call charts with «Oggi» (spec andamenti-chiamate, AC21, AC24, D1)

/** 07:15 in Rome on 10/11/2026: the working day hasn't started */
const beforeEight = new Date("2026-11-10T07:15:00+01:00")

describe("«Risposte per operatore» with «Oggi» before 08", () => {
  it("shows yesterday's 11–19 bars and table with the note (AC24, D1)", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=calls&range=today",
      fakeAnalisi({ now: beforeEight }),
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })

    expect(
      await within(panel).findByText(
        "La giornata di lavoro inizia alle 8: vedi le ore di ieri"
      )
    ).toBeInTheDocument()
    const region = await within(panel).findByRole("region", {
      name: "Dati del grafico",
    })
    // The default rows of the fake (3 operators), then «Totale»
    await waitFor(() =>
      expect(within(region).getAllByRole("row")).toHaveLength(5)
    )
  })
})

/** The search of the address, as the page wrote it */
const address = () => new URLSearchParams(window.location.search)

const NOTE = "La giornata di lavoro inizia alle 8: vedi le ore di ieri"

/** The rows of «Dati del grafico» of `panel`, header included */
const tableRows = async (panel: HTMLElement) =>
  within(
    await within(panel).findByRole("region", { name: "Dati del grafico" })
  ).getAllByRole("row")

describe("the call charts with «Oggi» at 15:20 (AC21)", () => {
  it("the admin's ranking counts the rows of today's hours, with no note", async () => {
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })

    await waitFor(async () => expect(await tableRows(panel)).toHaveLength(5))
    const rows = await tableRows(panel)
    expect(rows[1]).toHaveTextContent("Anna Rossi")
    expect(rows[4]).toHaveTextContent("Totale")
    expect(within(panel).queryByText(NOTE)).not.toBeInTheDocument()
  })

  it("the operator's series has 8 hours, the last in progress", async () => {
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", fakeAnalisi(), {
      role: "OPERATORE",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })

    await waitFor(async () => expect(await tableRows(panel)).toHaveLength(9))
    const rows = await tableRows(panel)
    expect(rows[1]).toHaveTextContent("08:00–09:00")
    expect(rows[8]).toHaveTextContent("15:00–15:20 (in corso)")
  })

  it("the operator's series with one hour is number only, with «Mostra 7 giorni» (AC23)", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=calls&range=today",
      fakeAnalisi({ now: new Date("2026-11-10T08:30:00+01:00") }),
      { role: "OPERATORE" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })

    expect(
      await within(panel).findByText("Un solo intervallo")
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole("button", { name: "Mostra 7 giorni" })
    ).toBeInTheDocument()
  })
})

describe("the call charts with «Oggi» before 08 (AC24)", () => {
  it.each([
    ["ADMIN", "none"],
    ["ADMIN", "last-year"],
    ["OPERATORE", "none"],
    ["OPERATORE", "last-year"],
  ] as const)(
    "as %s with %s are empty, and «Vedi ieri» changes only the comparison",
    async (role, compare) => {
      const user = userEvent.setup()
      renderAnalisi(
        `/dashboard/analisi?chart=calls&range=today&compare=${compare}`,
        fakeAnalisi({ now: beforeEight }),
        { role }
      )
      const panel = await screen.findByRole("tabpanel", {
        name: "Risposte per operatore",
      })
      expect(
        await within(panel).findAllByText("La giornata di lavoro inizia alle 8")
      ).not.toHaveLength(0)

      await user.click(within(panel).getByRole("button", { name: "Vedi ieri" }))

      await waitFor(() => expect(address().get("compare")).toBe("previous"))
      expect(address().get("range")).toBe("today")
      expect(address().get("chart")).toBe("calls")
      expect(await within(panel).findByText(NOTE)).toBeInTheDocument()
    }
  )

  it("the operator's series with «Periodo precedente» shows yesterday's 11–19 with the note", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=calls&range=today",
      fakeAnalisi({ now: beforeEight }),
      { role: "OPERATORE" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })

    expect(await within(panel).findByText(NOTE)).toBeInTheDocument()
    await waitFor(async () => expect(await tableRows(panel)).toHaveLength(9))
    const rows = await tableRows(panel)
    expect(rows[1]).toHaveTextContent("11:00–12:00")
    expect(rows[8]).toHaveTextContent("18:00–19:00")
    // Today's values are empty, yesterday's calls are in the comparison column
    const cells = within(rows[1]!).getAllByRole("cell")
    expect(cells.slice(1, 6).map((cell) => cell.textContent)).toEqual([
      "—",
      "—",
      "—",
      "—",
      "—",
    ])
  })

  it("«Tasso di appuntamento» of the admin shows yesterday's rows with the note", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=appointments&range=today",
      fakeAnalisi({ now: beforeEight }),
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Tasso di appuntamento",
    })

    expect(await within(panel).findByText(NOTE)).toBeInTheDocument()
    await waitFor(async () => expect(await tableRows(panel)).toHaveLength(4))
  })
})

/**
 * Downloads in jsdom, as in export.more.test.tsx: what the page saved, the
 * blob and the name
 */
function recordDownloads() {
  const saved: Array<{ blob: Blob; name: string }> = []
  const blobs = new Map<string, Blob>()
  const replace = (
    name: "createObjectURL" | "revokeObjectURL",
    value: unknown
  ) => {
    const before = Object.getOwnPropertyDescriptor(URL, name)
    Object.defineProperty(URL, name, {
      configurable: true,
      writable: true,
      value,
    })
    onTestFinished(() => {
      if (before === undefined) Reflect.deleteProperty(URL, name)
      else Object.defineProperty(URL, name, before)
    })
  }
  replace("createObjectURL", (blob: Blob) => {
    const url = `blob:test/${blobs.size}`
    blobs.set(url, blob)
    return url
  })
  replace("revokeObjectURL", () => undefined)
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      const blob = blobs.get(this.href)
      if (blob !== undefined) saved.push({ blob, name: this.download })
    })
  onTestFinished(() => click.mockRestore())
  return saved
}

/** What «Copia» of `panel` puts in the clipboard, once its table is there */
const copied = async (panel: HTMLElement) => {
  const user = userEvent.setup()
  const copy = await within(panel).findByRole("button", { name: "Copia" })
  await waitFor(() => expect(copy).toBeEnabled())
  await user.click(copy)
  return (await navigator.clipboard.readText()).split("\n")
}

describe("the files with «Oggi» (AC25)", () => {
  it("name the CSV of a ranking and the workbook with today's date once", async () => {
    const user = userEvent.setup()
    const saved = recordDownloads()
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })
    const csv = within(panel).getByRole("button", { name: "CSV" })
    await waitFor(() => expect(csv).toBeEnabled())

    await user.click(csv)
    expect(saved.at(-1)?.name).toBe(
      "mito_risposte-per-operatore_2026-11-10.csv"
    )

    const all = screen.getByRole("button", { name: /Esporta tutto/ })
    await waitFor(() => expect(all).toBeEnabled())
    await user.click(all)
    await waitFor(() =>
      expect(saved.at(-1)?.name).toBe("mito_analisi_2026-11-10.xlsx")
    )
  })

  it("write the hours of a call chart, its comparison and «per ora»", async () => {
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", fakeAnalisi(), {
      role: "OPERATORE",
    })
    const lines = await copied(
      await screen.findByRole("tabpanel", { name: "Risposte per operatore" })
    )

    expect(lines).toContain("Finestra\tOggi, 08:00–15:20")
    expect(lines).toContain(
      "Confronto\tPeriodo precedente: 9 nov 2026, 08:00–15:20"
    )
    expect(lines).toContain("Raggruppamento\tper ora")
  })

  it("write «Oggi, tutto il giorno» for the financed, with its day as the comparison", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=financed&range=today",
      fakeAnalisi(),
      { role: "OPERATORE" }
    )
    const lines = await copied(
      await screen.findByRole("tabpanel", { name: "Finanziato totale" })
    )

    expect(lines).toContain("Finestra\tOggi, tutto il giorno")
    expect(lines.find((line) => line.startsWith("Confronto\t"))).toMatch(
      /^Confronto\tPeriodo precedente: \d+ \w+ \d{4}$/
    )
    expect(lines.some((line) => line.startsWith("Raggruppamento"))).toBe(false)
  })
})
