import { afterEach, describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import { generateCallWorkbook } from "../callExport"
import { type FetchTask, formatMessages, formatTaskClosedAt } from "../utils"
import { type Message } from "@mito/domain/schemas"

// The rows as the dialog gets them from fetchCall, and the notes it then asks
// getMessages for.

const BASE_URL = "http://localhost:3000"
const RANGE = { from: new Date("2026-09-17"), to: new Date("2026-09-17") }

const call = (chatId: number | null, fullName: string) =>
  ({
    task: {
      state: "app.to",
      createdAt: "2026-09-10T08:00:00.000Z",
      closedAt: "2026-09-17T10:00:00.000Z",
    },
    operator: { name: "Carla", surname: "Rossi" },
    customers: {
      fullName,
      phoneNumber: "0612345678",
      fiscalCode: "BNCNNA75C44H501X",
      vatCode: null,
      chatId,
    },
  }) as unknown as FetchTask[number]

const message = (chatId: number, content: string) =>
  ({
    chatId,
    content,
    sendDate: "2026-09-17T09:30:00.000Z",
  }) as unknown as Message

// Dates are written in the time zone of the browser that builds the file
const at = (date: string) => formatTaskClosedAt(new Date(date))

/** Stands in for getMessages; returns the spy to read the request from. */
function answerMessages(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const rowsOf = (workbook: XLSX.WorkBook) =>
  XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Chiamate!, { header: 1 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("generateCallWorkbook", () => {
  it("scrive una riga per chiamata, con le note della chat del cliente", async () => {
    const fetchMock = answerMessages({
      result: [message(7, "richiamare"), message(8, "non risponde")],
    })

    const workbook = await generateCallWorkbook(
      BASE_URL,
      [call(7, "Anna Bianchi"), call(8, "Luca Verdi")],
      RANGE
    )

    const [header, first, second] = rowsOf(workbook)
    expect(header).toEqual([
      "Nome completo",
      "Numero di telefono",
      "Codice fiscale",
      "Importo finanziato",
      "Assegnato a",
      "Stato chiamate",
      "Data assegnazione",
      "Data chiamata",
      "Note",
    ])
    expect(first).toEqual([
      "Anna Bianchi",
      "0612345678",
      "BNCNNA75C44H501X",
      "",
      "Carla Rossi",
      "app.to",
      at("2026-09-10T08:00:00.000Z"),
      at("2026-09-17T10:00:00.000Z"),
      formatMessages([message(7, "richiamare")]),
    ])
    expect(first![8]).toContain("richiamare")
    expect(second![8]).toBe(formatMessages([message(8, "non risponde")]))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]).toMatchObject([
      `${BASE_URL}/api/export/export/getMessages`,
      { method: "POST", body: JSON.stringify({ chatIds: [7, 8] }) },
    ])
  })

  it("senza chiamate scrive solo le intestazioni e non chiede le note", async () => {
    const fetchMock = answerMessages({ result: [] })

    const workbook = await generateCallWorkbook(BASE_URL, [], RANGE)

    expect(rowsOf(workbook)).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("se nessun cliente ha una chat scrive le chiamate senza note e non le chiede", async () => {
    const fetchMock = answerMessages({ result: [] })

    const workbook = await generateCallWorkbook(
      BASE_URL,
      [call(null, "Anna Bianchi")],
      RANGE
    )

    const [, row] = rowsOf(workbook)
    expect(row![0]).toBe("Anna Bianchi")
    expect(row![8]).toBe("")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("se le note non arrivano fallisce dicendo con che stato ha risposto getMessages", async () => {
    answerMessages({ error: "Unauthorized" }, 401)

    await expect(
      generateCallWorkbook(BASE_URL, [call(7, "Anna Bianchi")], RANGE)
    ).rejects.toThrow(/getMessages.*401/)
  })
})
