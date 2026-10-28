import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ImportReadCancelled,
  openImportFile,
} from "@mito/client/import/readImportFile"
import { type Preview } from "@mito/client/import/session"
import { inProcessWorker } from "@mito/client/import/_test/inProcessWorker"
import { waveFile, waveRow } from "@mito/client/import/_test/workbooks"
import { ImportAlreadyRunning, ImportUnavailable } from "@mito/contract/errors"
import { type LookupKeys } from "@mito/domain/import/payload"
import { fakeImport } from "@/test/import"
import { renderImport } from "../../_test/page"

// A new import on the page, on a backend in memory and a reader the test
// drives, as the tests of `NewImport` of the Next.js app; the last one reads a
// real Wave file with the worker's code in this process

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

/** The page on `backend`, its reader answering as a good Wave file */
const renderNew = (backend = fakeImport()) => {
  const page = renderImport(backend)
  const { reader } = page
  reader.read.mockResolvedValue({ ok: true, format: "wave", keys })
  reader.preview.mockResolvedValue(preview)
  reader.body.mockResolvedValue(new Uint8Array([1, 2, 3]))
  reader.report.mockResolvedValue({
    fileName: "errori_import_wave_2026-10-25.xlsx",
    bytes: new Uint8Array([4, 5]),
  })
  return { ...page, backend }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const file = (name = "wave.xlsx") => new File(["x"], name)

const choose = async (chosen = file()) =>
  fireEvent.change(await screen.findByLabelText("File da importare"), {
    target: { files: [chosen] },
  })

const confirmButton = () =>
  screen.getByRole("button", { name: "Conferma l'import" })

/** The live region of the new import, not the toasts' */
const announced = () =>
  screen
    .getAllByRole("status")
    .find((region) => region.classList.contains("sr-only"))?.textContent

describe("NewImport", () => {
  it("legge il file, mostra l'anteprima e avvia l'import (AC5, AC7, AC21)", async () => {
    const { backend, reader } = renderNew()
    await choose()

    expect(await screen.findByText("Righe del file")).toBeTruthy()
    expect(backend.state.lookups).toEqual([keys])
    expect(announced()).toBe("Anteprima di wave.xlsx pronta")
    expect(
      screen.getByText("Clienti da aggiornare").nextSibling?.textContent
    ).toBe("2")
    const lists = backend.asked("list")
    const actives = backend.asked("active")

    fireEvent.click(confirmButton())

    expect(
      await screen.findByText(/è in corso: puoi usare il resto del CRM/)
    ).toBeTruthy()
    expect(backend.state.uploads).toEqual([
      { fileName: "wave.xlsx", format: "wave", parts: 1, data: "AQID" },
    ])
    expect(backend.state.starts).toEqual([{ uploadId: "u-1", rows: [2, 3, 4] }])
    expect(reader.cancel).toHaveBeenCalled()
    // The notice of its end follows it, and the history shows it
    await waitFor(() => expect(backend.asked("active")).toBe(actives + 1))
    await waitFor(() => expect(backend.asked("list")).toBe(lists + 1))
  })

  it("prende un file trascinato nell'area (AC5)", async () => {
    const { opened } = renderNew()
    const dropped = file("standard.csv")
    fireEvent.drop((await screen.findByText(/Trascina qui/)).parentElement!, {
      dataTransfer: { files: [dropped] },
    })

    expect(await screen.findByText("Righe del file")).toBeTruthy()
    expect(opened).toEqual([dropped])
  })

  it("dice perché un file non si importa, senza chiedere al server (AC5, AC6)", async () => {
    const { backend, reader } = renderNew()
    reader.read.mockResolvedValue({
      ok: false,
      message: "Formato Wave: manca la colonna Codice NDG",
    })
    await choose()

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Formato Wave: manca la colonna Codice NDG"
    )
    expect(backend.asked("lookup")).toBe(0)
    expect(screen.getByRole("button", { name: "Scegli il file" })).toBeTruthy()
  })

  it("annullare la lettura la chiude e non chiama niente (AC17, AC18)", async () => {
    const { backend, reader } = renderNew()
    reader.read.mockReturnValue(
      new Promise((_, reject) =>
        reader.cancel.mockImplementation(() =>
          reject(new ImportReadCancelled())
        )
      )
    )
    await choose()

    expect(await screen.findByText("wave.xlsx")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }))

    expect(
      await screen.findByRole("button", { name: "Scegli il file" })
    ).toBeTruthy()
    expect(reader.cancel).toHaveBeenCalled()
    expect(backend.asked("lookup")).toBe(0)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("annullare l'anteprima non manda niente (AC17)", async () => {
    const { backend, reader } = renderNew()
    await choose()
    await screen.findByText("Righe del file")

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }))

    expect(screen.getByRole("button", { name: "Scegli il file" })).toBeTruthy()
    expect(reader.cancel).toHaveBeenCalled()
    expect(backend.asked("upload")).toBe(0)
    expect(backend.asked("start")).toBe(0)
  })

  it("mostra ogni numero dell'anteprima, e il formato (AC7)", async () => {
    const { reader } = renderNew()
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
    await choose()
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

  it("conferma un file di sole righe cliente (AC16)", async () => {
    const { backend, reader } = renderNew()
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, importable: 0, customerOnly: 1 },
      expected: [3],
    })
    await choose()
    await screen.findByText("Righe del file")

    expect(screen.queryByText("Nessuna riga da importare")).toBeNull()
    fireEvent.click(confirmButton())

    await waitFor(() =>
      expect(backend.state.starts).toEqual([{ uploadId: "u-1", rows: [3] }])
    )
  })

  it("non c'è niente da confermare se nessuna riga si scriverebbe (AC16)", async () => {
    const { reader } = renderNew()
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, importable: 0, customerOnly: 0 },
      expected: [],
    })
    await choose()

    expect(await screen.findByText("Nessuna riga da importare")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Conferma l'import" })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: "Scarica il report errori" })
    ).toBeTruthy()
  })

  it("scarica il report delle righe scartate (AC14, AC15)", async () => {
    const { backend } = renderNew()
    await choose()
    await screen.findByText("Righe del file")
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
    expect(backend.asked("upload")).toBe(0)
    vi.useRealTimers()
  })

  it("dice che il report non si è creato quando il worker non ci riesce", async () => {
    const { reader } = renderNew()
    reader.report.mockRejectedValue(new Error("worker crashed"))
    await choose()
    await screen.findByText("Righe del file")

    fireEvent.click(
      screen.getByRole("button", { name: "Scarica il report errori" })
    )

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Il report errori non si è potuto creare: riprova"
    )
    expect(confirmButton()).toBeTruthy()
  })

  it("due clic su Conferma avviano un import", async () => {
    const { backend } = renderNew()
    await choose()
    await screen.findByText("Righe del file")

    const button = confirmButton()
    act(() => {
      button.click()
      button.click()
    })

    await screen.findByText(/è in corso: puoi usare il resto del CRM/)
    expect(backend.asked("upload")).toBe(1)
    expect(backend.asked("start")).toBe(1)
  })

  it("il focus segue i passi (AC41)", async () => {
    const { reader } = renderNew()
    let read!: (value: Awaited<ReturnType<typeof reader.read>>) => void
    reader.read.mockReturnValue(new Promise((resolve) => (read = resolve)))
    const chooseButton = await screen.findByRole("button", {
      name: "Scegli il file",
    })
    expect(document.activeElement).not.toBe(chooseButton)

    await choose()
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

  it("non c'è report da scaricare se nessuna riga è scartata (AC14)", async () => {
    const { reader } = renderNew()
    reader.preview.mockResolvedValue({
      ...preview,
      counts: { ...preview.counts, discarded: 0 },
      discarded: [],
    })
    await choose()
    await screen.findByText("Righe del file")

    expect(
      screen.queryByRole("button", { name: "Scarica il report errori" })
    ).toBeNull()
  })

  it("mostra il motivo del server quando l'import non parte (AC22)", async () => {
    const { backend } = renderNew()
    backend.state.startRejected = new ImportAlreadyRunning({
      startedBy: "Anna Rossi",
      time: "10:05",
    })
    await choose()
    await screen.findByText("Righe del file")

    fireEvent.click(confirmButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "C'è già un import in corso, avviato da Anna Rossi alle 10:05"
    )
    expect(confirmButton()).toBeTruthy()
  })

  it("dice quando l'import non c'è su questo ambiente (PRECONDITION_FAILED)", async () => {
    const { backend } = renderNew()
    backend.state.startRejected = new ImportUnavailable()
    await choose()
    await screen.findByText("Righe del file")

    fireEvent.click(confirmButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'import non è disponibile su questo ambiente"
    )
  })

  it("tiene per sé i dettagli di un errore inatteso", async () => {
    const { backend } = renderNew()
    backend.state.failingUpload = true
    await choose()
    await screen.findByText("Righe del file")

    fireEvent.click(confirmButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'import non è partito: riprova"
    )
  })

  it("dice che l'anteprima non si è calcolata quando il lookup fallisce", async () => {
    const { backend, reader } = renderNew()
    backend.state.failingLookup = true
    await choose()

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'anteprima non si è potuta calcolare: riprova"
    )
    // Said once: by the alert, not by the status too
    expect(announced()).toBe("")
    expect(reader.cancel).toHaveBeenCalled()
  })

  it("chiude la lettura quando l'admin lascia la pagina", async () => {
    const { reader, unmount } = renderNew()
    await choose()
    await screen.findByText("Righe del file")
    reader.cancel.mockClear()

    act(() => unmount())

    expect(reader.cancel).toHaveBeenCalled()
  })

  it("con il worker vero legge un file Wave, chiede le sue chiavi e ne mostra l'anteprima", async () => {
    // The compressed body needs `Blob.stream`, which jsdom doesn't have: the
    // reader's tests in @mito/client send it
    const backend = fakeImport()
    renderImport(backend, {
      open: (chosen) =>
        openImportFile(chosen, {
          createWorker: inProcessWorker,
          now: new Date("2025-01-15T10:00:00.000Z"),
        }),
    })
    await choose(new File([waveFile(waveRow())], "0125_import.xlsx"))

    expect(await screen.findByText("Righe del file")).toBeTruthy()
    expect(backend.state.lookups).toEqual([
      expect.objectContaining({ fiscalCodes: [expect.any(String)] }),
    ])
    expect(screen.getByText("Righe importabili").nextSibling?.textContent).toBe(
      "1"
    )
    expect(
      screen.getByText("0125_import.xlsx").parentElement?.textContent
    ).toBe("0125_import.xlsx, formato Wave")
  })
})
