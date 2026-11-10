import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as XLSX from "xlsx"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

// «Esporta tutto» with «Oggi» (spec andamenti-chiamate, AC21, AC22, AC25)

const URL_TODAY = "/dashboard/analisi?range=today"

/**
 * Downloads in jsdom, as in export.more.test.tsx: what the page saved, the
 * blob and the name. Puts everything back at the end of the test
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

/** The workbook the page saved, read back: sheet name to its rows (header rows first) */
async function readWorkbook(blob: Blob) {
  const read = XLSX.read(new Uint8Array(await blob.arrayBuffer()), {
    type: "array",
  })
  return Object.fromEntries(
    read.SheetNames.map((name) => [
      name,
      XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name]!, {
        header: 1,
        defval: "",
      }),
    ])
  )
}

/** The value written next to `label` in the header rows of a sheet */
const headerValue = (rows: unknown[][], label: string) =>
  rows.find((row) => row[0] === label)?.[1]

/** Clicks «Esporta tutto» once it is enabled, and waits for the file */
async function exportAll(saved: Array<{ blob: Blob; name: string }>) {
  const user = userEvent.setup()
  const button = await screen.findByRole("button", { name: /Esporta tutto/ })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  await waitFor(() => expect(saved).toHaveLength(1))
  return readWorkbook(saved[0]!.blob)
}

describe("«Esporta tutto» con «Oggi» (AC21, AC22, AC25)", () => {
  it("writes «Oggi, tutto il giorno» in the financed sheet and «Oggi, 08:00–15:20» in the calls sheet", async () => {
    const saved = recordDownloads()
    renderAnalisi(URL_TODAY, fakeAnalisi(), { role: "ADMIN" })

    const sheets = await exportAll(saved)

    expect(headerValue(sheets["Finanziato totale"]!, "Finestra")).toBe(
      "Oggi, tutto il giorno"
    )
    expect(headerValue(sheets["Risposte per operatore"]!, "Finestra")).toBe(
      "Oggi, 08:00–15:20"
    )
  })

  it("writes one sheet per chart, and the file is named with today's date once", async () => {
    const saved = recordDownloads()
    renderAnalisi(URL_TODAY, fakeAnalisi(), { role: "ADMIN" })

    const sheets = await exportAll(saved)

    expect(saved[0]?.name).toBe("mito_analisi_2026-11-10.xlsx")
    expect(Object.keys(sheets)).toEqual([
      "Finanziato totale",
      "Finanziato medio per pratica",
      "Finanziato per sede",
      "Contatti con esito",
      "Risposte per operatore",
      "Tasso di appuntamento",
    ])
  })

  it("the calls sheets compare with their hours, the financed sheets with the day only", async () => {
    const saved = recordDownloads()
    renderAnalisi(URL_TODAY, fakeAnalisi(), { role: "ADMIN" })

    const sheets = await exportAll(saved)

    expect(headerValue(sheets["Risposte per operatore"]!, "Confronto")).toBe(
      "Periodo precedente: 9 nov 2026, 08:00–15:20"
    )
    expect(headerValue(sheets["Tasso di appuntamento"]!, "Confronto")).toBe(
      "Periodo precedente: 9 nov 2026, 08:00–15:20"
    )
    expect(headerValue(sheets["Finanziato totale"]!, "Confronto")).toBe(
      "Periodo precedente: 9 nov 2026"
    )
    expect(
      headerValue(sheets["Finanziato medio per pratica"]!, "Confronto")
    ).toBe("Periodo precedente: 9 nov 2026")
  })
})
