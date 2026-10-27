import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { TRPCClientError } from "@trpc/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type LookupKeys } from "@mito/domain/import/payload"
import type * as ReadImportFile from "@mito/client/import/readImportFile"
import { type Preview } from "@mito/client/import/session"
import { NewImport } from "../NewImport"

const keys: LookupKeys = {
  fiscalCodes: ["AAAAAA00A00A000A"],
  vatCodes: [],
  customerCodes: [],
  praticaIds: ["P-1"],
}

const preview: Preview = {
  format: "wave",
  counts: {
    rows: 4,
    importable: 2,
    customerOnly: 1,
    discarded: 1,
    customersNew: 1,
    customersToUpdate: 2,
    practicesNew: 2,
    practicesToUpdate: 0,
    linksNew: 2,
  },
  discarded: [{ row: 5, reasons: ["Codice fiscale non valido"] }],
  expected: [2, 3, 4],
}

const mocks = vi.hoisted(() => {
  const reader = {
    read: vi.fn(),
    preview: vi.fn(),
    body: vi.fn(),
    report: vi.fn(),
    cancel: vi.fn(),
  }
  const utils = {
    client: {
      import: {
        lookup: { mutate: vi.fn() },
        upload: { mutate: vi.fn() },
        start: { mutate: vi.fn() },
      },
    },
    import: {
      list: { invalidate: vi.fn() },
    },
  }
  return { reader, utils, watch: vi.fn(), opened: [] as File[] }
})

vi.mock("@mito/client/import/readImportFile", async (importOriginal) => ({
  ...(await importOriginal<typeof ReadImportFile>()),
  openImportFile: (file: File) => {
    mocks.opened.push(file)
    return mocks.reader
  },
}))

vi.mock("@/app/_context/ImportStatus", () => ({
  useImportStatus: () => ({ watch: mocks.watch }),
}))

vi.mock("@/trpc/react", () => ({
  api: { useUtils: () => mocks.utils },
}))

const { reader, utils } = mocks
const { lookup, upload, start } = utils.client.import

beforeEach(() => {
  mocks.opened = []
  for (const fn of [
    ...Object.values(reader),
    lookup.mutate,
    upload.mutate,
    start.mutate,
    utils.import.list.invalidate,
    mocks.watch,
  ]) {
    fn.mockReset()
  }
  reader.read.mockResolvedValue({ ok: true, format: "wave", keys })
  reader.preview.mockResolvedValue(preview)
  reader.body.mockResolvedValue(new Uint8Array([1, 2, 3]))
  reader.report.mockResolvedValue({
    fileName: "errori_import_wave_2026-10-25.xlsx",
    bytes: new Uint8Array([4, 5]),
  })
  lookup.mutate.mockResolvedValue({
    customers: [],
    praticaIds: [],
    links: [],
  })
  upload.mutate.mockResolvedValue({ uploadId: "u-1" })
  start.mutate.mockResolvedValue({ runId: 7 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const file = (name = "wave.xlsx") => new File(["x"], name)

const choose = (chosen = file()) =>
  fireEvent.change(screen.getByLabelText("File da importare"), {
    target: { files: [chosen] },
  })

const confirmButton = () =>
  screen.getByRole("button", { name: "Conferma l'import" })

describe("NewImport", () => {
  it("reads the file, shows the preview and starts the import (AC5, AC7, AC21)", async () => {
    render(<NewImport />)
    choose()

    expect(await screen.findByText("Righe del file")).toBeTruthy()
    expect(lookup.mutate).toHaveBeenCalledWith(keys)
    expect(screen.getByRole("status").textContent).toBe(
      "Anteprima di wave.xlsx pronta"
    )
    expect(
      screen.getByText("Clienti da aggiornare").nextSibling?.textContent
    ).toBe("2")

    fireEvent.click(confirmButton())

    expect(
      await screen.findByText(/è in corso: puoi usare il resto del CRM/)
    ).toBeTruthy()
    expect(upload.mutate).toHaveBeenCalledWith({
      fileName: "wave.xlsx",
      format: "wave",
      parts: 1,
      data: "AQID",
    })
    expect(start.mutate).toHaveBeenCalledWith({
      uploadId: "u-1",
      rows: [2, 3, 4],
    })
    expect(reader.cancel).toHaveBeenCalled()
    expect(mocks.watch).toHaveBeenCalledWith(7)
    expect(utils.import.list.invalidate).toHaveBeenCalled()
  })

  it("takes a file dropped on the area (AC5)", async () => {
    render(<NewImport />)
    const dropped = file("standard.csv")
    fireEvent.drop(screen.getByText(/Trascina qui/).parentElement!, {
      dataTransfer: { files: [dropped] },
    })

    expect(await screen.findByText("Righe del file")).toBeTruthy()
    expect(mocks.opened).toEqual([dropped])
  })

  it("shows why a file can't be imported, without asking the server (AC5, AC6)", async () => {
    reader.read.mockResolvedValue({
      ok: false,
      message: "Formato Wave: manca la colonna Codice NDG",
    })
    render(<NewImport />)
    choose()

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Formato Wave: manca la colonna Codice NDG"
    )
    expect(lookup.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Scegli il file" })).toBeTruthy()
  })

  it("cancelling the reading ends it and calls nothing (AC17, AC18)", async () => {
    const { ImportReadCancelled } =
      await import("@mito/client/import/readImportFile")
    reader.read.mockReturnValue(
      new Promise((_, reject) =>
        reader.cancel.mockImplementation(() =>
          reject(new ImportReadCancelled())
        )
      )
    )
    render(<NewImport />)
    choose()

    expect(await screen.findByText("wave.xlsx")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }))

    expect(
      await screen.findByRole("button", { name: "Scegli il file" })
    ).toBeTruthy()
    expect(reader.cancel).toHaveBeenCalled()
    expect(lookup.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("cancelling the preview sends nothing (AC17)", async () => {
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }))

    expect(screen.getByRole("button", { name: "Scegli il file" })).toBeTruthy()
    expect(reader.cancel).toHaveBeenCalled()
    expect(upload.mutate).not.toHaveBeenCalled()
    expect(start.mutate).not.toHaveBeenCalled()
  })

  it("shows every number of the preview, and the format (AC7)", async () => {
    reader.preview.mockResolvedValue({
      ...preview,
      counts: {
        rows: 12_000,
        importable: 2,
        customerOnly: 3,
        discarded: 4,
        customersNew: 5,
        customersToUpdate: 6,
        practicesNew: 7,
        practicesToUpdate: 8,
        linksNew: 9,
      },
    })
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    expect(
      screen
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextSibling?.textContent])
    ).toEqual([
      ["Righe del file", "12.000"],
      ["Righe importabili", "2"],
      ["Righe solo cliente", "3"],
      ["Righe scartate", "4"],
      ["Clienti nuovi", "5"],
      ["Clienti da aggiornare", "6"],
      ["Pratiche nuove", "7"],
      ["Pratiche da aggiornare", "8"],
      ["Legami nuovi", "9"],
    ])
    expect(screen.getByText("wave.xlsx").parentElement?.textContent).toBe(
      "wave.xlsx, formato Wave"
    )
  })

  it("confirms a file of customer-only rows (AC16)", async () => {
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, importable: 0, customerOnly: 1 },
      expected: [3],
    })
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    expect(screen.queryByText("Nessuna riga da importare")).toBeNull()
    fireEvent.click(confirmButton())

    await waitFor(() =>
      expect(start.mutate).toHaveBeenCalledWith({
        uploadId: "u-1",
        rows: [3],
      })
    )
  })

  it("has nothing to confirm when no row would be written (AC16)", async () => {
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, importable: 0, customerOnly: 0 },
      expected: [],
    })
    render(<NewImport />)
    choose()

    expect(await screen.findByText("Nessuna riga da importare")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Conferma l'import" })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: "Scarica il report errori" })
    ).toBeTruthy()
  })

  it("downloads the report of the discarded rows (AC14, AC15)", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    })
    const downloads: string[] = []
    URL.createObjectURL = vi.fn(() => "blob:report")
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download)
    })
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    fireEvent.click(
      screen.getByRole("button", { name: "Scarica il report errori" })
    )

    await waitFor(() =>
      expect(downloads).toEqual(["errori_import_wave_2026-10-25.xlsx"])
    )
    // The link lives while the browser saves the file
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(40_000)
    expect(revoke).toHaveBeenCalledWith("blob:report")
    expect(upload.mutate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("says the report failed when the worker can't make it", async () => {
    reader.report.mockRejectedValue(new Error("worker crashed"))
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    fireEvent.click(
      screen.getByRole("button", { name: "Scarica il report errori" })
    )

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Il report errori non si è potuto creare: riprova"
    )
    expect(confirmButton()).toBeTruthy()
  })

  it("two clicks on Conferma start one import", async () => {
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    const button = confirmButton()
    act(() => {
      button.click()
      button.click()
    })

    await screen.findByText(/è in corso: puoi usare il resto del CRM/)
    expect(upload.mutate).toHaveBeenCalledTimes(1)
    expect(start.mutate).toHaveBeenCalledTimes(1)
  })

  it("moves the focus with the steps (AC41)", async () => {
    let read!: (value: unknown) => void
    reader.read.mockReturnValue(new Promise((resolve) => (read = resolve)))
    render(<NewImport />)
    const chooseButton = screen.getByRole("button", { name: "Scegli il file" })
    expect(document.activeElement).not.toBe(chooseButton)

    choose()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Annulla" })
      )
    )

    await act(async () => read({ ok: true, format: "wave", keys }))
    await screen.findByText("Righe del file")
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Anteprima di wave.xlsx"
    )

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }))
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Scegli il file" })
    )
  })

  it("has no report to download when nothing is discarded (AC14)", async () => {
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, discarded: 0 },
      discarded: [],
    })
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    expect(
      screen.queryByRole("button", { name: "Scarica il report errori" })
    ).toBeNull()
  })

  it("shows the server's reason when the import can't start (AC22)", async () => {
    start.mutate.mockRejectedValue(
      new TRPCClientError("C'è già un import in corso", {
        result: {
          error: {
            code: -32009,
            message: "C'è già un import in corso",
            data: { code: "CONFLICT", httpStatus: 409 },
          },
        },
      })
    )
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    fireEvent.click(confirmButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "C'è già un import in corso"
    )
    expect(confirmButton()).toBeTruthy()
  })

  it("keeps the details of an unexpected failure to itself", async () => {
    upload.mutate.mockRejectedValue(new Error("fetch failed"))
    render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")

    fireEvent.click(confirmButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'import non è partito: riprova"
    )
  })

  it("says the preview failed when the lookup fails", async () => {
    lookup.mutate.mockRejectedValue(
      new TRPCClientError("connect ECONNREFUSED", {
        result: {
          error: {
            code: -32603,
            message: "connect ECONNREFUSED",
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      })
    )
    render(<NewImport />)
    choose()

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'anteprima non si è potuta calcolare: riprova"
    )
    // Said once: by the alert, not by the status too
    expect(screen.getByRole("status").textContent).toBe("")
    expect(reader.cancel).toHaveBeenCalled()
  })

  it("ends the reading when the admin leaves the page", async () => {
    const { unmount } = render(<NewImport />)
    choose()
    await screen.findByText("Righe del file")
    reader.cancel.mockClear()

    act(() => unmount())

    expect(reader.cancel).toHaveBeenCalled()
  })
})
