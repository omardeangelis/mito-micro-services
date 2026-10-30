import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

const WINDOW = "range=custom&from=2026-10-01&to=2026-10-30&compare=none"

/**
 * Downloads in jsdom: `URL.createObjectURL` doesn't exist there, and a click
 * on the temporary link goes nowhere. This records what the page saved (the
 * blob and the name) and puts everything back at the end of the test
 */
function recordDownloads(options: { refuse?: boolean } = {}) {
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
    if (options.refuse) throw new Error("blocked")
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

const panelOf = (title: string) =>
  screen.findByRole("tabpanel", { name: title })

const buttonsOf = (panel: HTMLElement) => ({
  csv: within(panel).getByRole("button", { name: "CSV" }),
  excel: within(panel).getByRole("button", { name: "Excel" }),
  copy: within(panel).getByRole("button", { name: "Copia" }),
})

describe("«Dati del grafico» (AC26, AC29–AC31)", () => {
  it("«Copia» says «Copia non riuscita» when the clipboard refuses", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await panelOf("Finanziato per sede")
    const { copy } = buttonsOf(panel)
    await waitFor(() => expect(copy).toBeEnabled())
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied")
    )

    await user.click(copy)

    expect(await screen.findByText("Copia non riuscita")).toBeInTheDocument()
    expect(screen.queryByText("Tabella copiata")).not.toBeInTheDocument()
  })

  it("«CSV» saves a blob named after the window of the data", async () => {
    const user = userEvent.setup()
    const saved = recordDownloads()
    renderAnalisi(
      `/dashboard/analisi?chart=branches&${WINDOW}`,
      fakeAnalisi(),
      { role: "ADMIN" }
    )
    const panel = await panelOf("Finanziato per sede")
    const { csv } = buttonsOf(panel)
    await waitFor(() => expect(csv).toBeEnabled())

    await user.click(csv)

    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe(
      "mito_finanziato-per-sede_2026-10-01_2026-10-30.csv"
    )
    expect(saved[0]?.blob.type).toBe("text/csv;charset=utf-8")
    // The name is also in the row, with the rows of the file
    expect(
      within(panel).getByText(/9 righe, le stesse del file/)
    ).toBeInTheDocument()
  })

  it("«Excel» saves an .xlsx named after the window of the data", async () => {
    const user = userEvent.setup()
    const saved = recordDownloads()
    renderAnalisi(
      `/dashboard/analisi?chart=branches&${WINDOW}`,
      fakeAnalisi(),
      { role: "ADMIN" }
    )
    const panel = await panelOf("Finanziato per sede")
    const { excel } = buttonsOf(panel)
    await waitFor(() => expect(excel).toBeEnabled())

    await user.click(excel)

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]?.name).toBe(
      "mito_finanziato-per-sede_2026-10-01_2026-10-30.xlsx"
    )
  })

  it("a download that does not start says «Excel non scaricato. Riprova.»", async () => {
    const user = userEvent.setup()
    recordDownloads({ refuse: true })
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await panelOf("Finanziato per sede")
    const { excel } = buttonsOf(panel)
    await waitFor(() => expect(excel).toBeEnabled())

    await user.click(excel)

    expect(
      await screen.findByText("Excel non scaricato. Riprova.")
    ).toBeInTheDocument()
  })

  it("while the data loads there is no table and the buttons are disabled", async () => {
    const fake = fakeAnalisi()
    const release = fake.hold("branches")
    renderAnalisi("/dashboard/analisi?chart=branches", fake, {
      role: "ADMIN",
    })
    const panel = await panelOf("Finanziato per sede")

    expect(
      await within(panel).findByText("Il grafico sta caricando.")
    ).toBeInTheDocument()
    const { csv, excel, copy } = buttonsOf(panel)
    for (const button of [csv, excel, copy]) expect(button).toBeDisabled()
    expect(
      screen.queryByRole("region", { name: "Dati del grafico" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Esporta tutto/ })).toBeDisabled()

    release()

    await waitFor(() => expect(csv).toBeEnabled())
    expect(
      screen.getByRole("region", { name: "Dati del grafico" })
    ).toBeInTheDocument()
  })

  it("an empty chart has no table and says why, with the buttons disabled", async () => {
    renderAnalisi(
      `/dashboard/analisi?chart=branches&${WINDOW}`,
      fakeAnalisi({ branchRows: [] }),
      { role: "ADMIN" }
    )
    const panel = await panelOf("Finanziato per sede")

    const reason = await within(panel).findAllByText(
      /non risulta nessuna pratica liquidata/
    )
    // The box of the chart and the row of «Dati del grafico»
    expect(reason).toHaveLength(2)
    const { csv, excel, copy } = buttonsOf(panel)
    for (const button of [csv, excel, copy]) expect(button).toBeDisabled()
    expect(
      screen.queryByRole("region", { name: "Dati del grafico" })
    ).not.toBeInTheDocument()
  })

  it("a chart that failed has no table, and the row says it did not load", async () => {
    const fake = fakeAnalisi()
    fake.state.failing.add("branches")
    renderAnalisi("/dashboard/analisi?chart=branches", fake, {
      role: "ADMIN",
    })
    const panel = await panelOf("Finanziato per sede")

    expect(
      await within(panel).findByText("Il grafico non si è caricato.")
    ).toBeInTheDocument()
    expect(buttonsOf(panel).csv).toBeDisabled()
    expect(
      screen.queryByRole("region", { name: "Dati del grafico" })
    ).not.toBeInTheDocument()
  })
})

describe("«Esporta tutto» (AC32)", () => {
  it("writes one workbook and names the chart left out", async () => {
    const user = userEvent.setup()
    const saved = recordDownloads()
    renderAnalisi(
      `/dashboard/analisi?chart=financed&${WINDOW}`,
      fakeAnalisi({ branchRows: [] }),
      { role: "ADMIN" }
    )
    const button = await screen.findByRole("button", {
      name: "Esporta tutto 5/6",
    })
    await waitFor(() => expect(button).toBeEnabled())

    await user.click(button)

    expect(
      await screen.findByText(
        'Esportati 5 grafici su 6: "Finanziato per sede" non ha dati da esportare.'
      )
    ).toBeInTheDocument()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe("mito_analisi_2026-10-01_2026-10-30.xlsx")
  })

  it("says «Excel non scaricato. Riprova.» when the download does not start", async () => {
    const user = userEvent.setup()
    recordDownloads({ refuse: true })
    renderAnalisi(
      `/dashboard/analisi?chart=financed&${WINDOW}`,
      fakeAnalisi(),
      {
        role: "ADMIN",
      }
    )
    const button = await screen.findByRole("button", {
      name: "Esporta tutto 6/6",
    })
    await waitFor(() => expect(button).toBeEnabled())

    await user.click(button)

    expect(
      await screen.findByText("Excel non scaricato. Riprova.")
    ).toBeInTheDocument()
  })
})

describe("the Tab path (AC34)", () => {
  it("goes from «Raggruppa per» straight to «CSV»", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=financed", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await panelOf("Finanziato totale")
    const csv = within(panel).getByRole("button", { name: "CSV" })
    await waitFor(() => expect(csv).toBeEnabled())
    await waitFor(() =>
      expect(panel.querySelector(".recharts-surface")).not.toBeNull()
    )

    within(panel).getByRole("combobox", { name: "Raggruppa per" }).focus()
    await user.tab()

    expect(csv).toHaveFocus()
  })

  it("goes from the badge «Adesso» straight to «CSV»", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=progress", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await panelOf("Contatti con esito")
    const csv = within(panel).getByRole("button", { name: "CSV" })
    await waitFor(() => expect(csv).toBeEnabled())
    await waitFor(() =>
      expect(panel.querySelector(".recharts-surface")).not.toBeNull()
    )

    within(panel)
      .getByRole("button", { name: "Adesso: non segue la finestra" })
      .focus()
    await user.tab()

    expect(csv).toHaveFocus()
  })
})
