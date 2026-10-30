import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { IMPORT_EXTENSIONS } from "@mito/client/import/messages"
import { cn } from "@/lib/utils"
import { ImportPreview } from "./ImportPreview"
import { type NewImportState, useNewImport } from "./useNewImport"

/**
 * What the screen reader hears at each step (AC41). A message is an alert,
 * which it hears already.
 */
const announcement = (state: NewImportState) => {
  switch (state.step) {
    case "choose":
      return ""
    case "reading":
      return `Lettura di ${state.fileName}…`
    case "preview":
      return state.message ? "" : `Anteprima di ${state.fileName} pronta`
    case "sending":
      return "Invio del file…"
    case "started":
      return "Import avviato"
  }
}

/** A new import: choice of the file, preview, confirmation (AC5–AC18, AC22). */
export function NewImport() {
  const { state, choose, cancel, confirm, downloadReport } = useNewImport()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // The focus follows the step, so the keyboard goes on from what appeared
  // (AC41): the button to cancel the reading, the preview, the button to
  // choose a file. Not on the first render: the page has its own
  const chooseButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const previewBox = useRef<HTMLDivElement>(null)
  const shownStep = useRef(state.step)
  useEffect(() => {
    if (shownStep.current === state.step) return
    shownStep.current = state.step
    if (state.step === "reading") cancelButton.current?.focus()
    else if (state.step === "preview" || state.step === "sending")
      previewBox.current?.focus()
    else chooseButton.current?.focus()
  }, [state.step])

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void choose(file)
    if (input.current) input.current.value = ""
  }

  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement(state)}
      </p>

      {state.step === "choose" || state.step === "started" ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            pick(event.dataTransfer.files)
          }}
          className={cn(
            "flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8 text-center",
            dragging ? "bg-primary-soft border-primary" : "border-border-strong"
          )}
        >
          {state.step === "started" ? (
            <p>
              L&apos;import di{" "}
              <span className="font-bold">{state.fileName}</span> è in corso:
              puoi usare il resto del CRM, ti avviso quando finisce.
            </p>
          ) : null}
          <p>Trascina qui un file Excel o CSV fino a 15 MB, oppure</p>
          <input
            ref={input}
            type="file"
            aria-label="File da importare"
            accept={IMPORT_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(event) => pick(event.target.files)}
          />
          <Button
            ref={chooseButton}
            type="button"
            onClick={() => input.current?.click()}
          >
            Scegli il file
          </Button>
          {state.step === "choose" && state.message ? (
            <p role="alert" className="text-destructive-text">
              {state.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.step === "reading" ? (
        <div className="flex items-center gap-4">
          <p>
            Lettura di <span className="font-bold">{state.fileName}</span>…
          </p>
          <Button
            ref={cancelButton}
            type="button"
            variant="outline"
            onClick={cancel}
          >
            Annulla
          </Button>
        </div>
      ) : null}

      {state.step === "preview" || state.step === "sending" ? (
        <div
          ref={previewBox}
          tabIndex={-1}
          aria-label={`Anteprima di ${state.fileName}`}
          className="outline-none"
        >
          <ImportPreview fileName={state.fileName} preview={state.preview} />
          {state.preview.counts.importable +
            state.preview.counts.customerOnly ===
          0 ? (
            <p className="mt-4 font-bold">Nessuna riga da importare</p>
          ) : null}
          {state.step === "preview" && state.message ? (
            <p role="alert" className="text-destructive-text mt-4">
              {state.message}
            </p>
          ) : null}
          {state.step === "sending" ? (
            <p className="mt-4">
              Invio del file… Non chiudere la scheda finché l&apos;import non
              parte.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-4">
            {state.preview.counts.importable +
              state.preview.counts.customerOnly >
            0 ? (
              <Button
                type="button"
                disabled={state.step === "sending"}
                onClick={() => void confirm()}
              >
                Conferma l&apos;import
              </Button>
            ) : null}
            {state.preview.counts.discarded > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={state.step === "sending"}
                onClick={() => void downloadReport()}
              >
                Scarica il report errori
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={state.step === "sending"}
              onClick={cancel}
            >
              Annulla
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
