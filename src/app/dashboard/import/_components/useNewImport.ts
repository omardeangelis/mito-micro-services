"use client"

import { TRPCClientError } from "@trpc/client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useImportStatus } from "@/app/_context/ImportStatus"
import {
  ImportReadCancelled,
  type ImportReader,
  openImportFile,
} from "@/lib/import/readImportFile"
import { type Preview } from "@/lib/import/session"
import { uploadAndStart } from "@/lib/import/upload"
import { api } from "@/trpc/react"

// The steps of a new import (T17): choose a file, read it in the worker,
// preview it, confirm it. Nothing is written before `import.start` answers;
// cancelling at any step ends the worker without calling the server (AC17)

export type NewImportState =
  | { step: "choose"; message?: string }
  | { step: "reading"; fileName: string }
  | { step: "preview"; fileName: string; preview: Preview; message?: string }
  | { step: "sending"; fileName: string; preview: Preview }
  | { step: "started"; fileName: string }

/** The server's own messages, in Italian, for the errors the admin can act on. */
const readableCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
])

const messageOf = (error: unknown, fallback: string) => {
  if (
    error instanceof TRPCClientError &&
    readableCodes.has((error.data as { code?: string } | undefined)?.code ?? "")
  ) {
    return error.message
  }
  if (error instanceof Error && error.message.startsWith("Il file")) {
    return error.message
  }
  return fallback
}

export function useNewImport() {
  const utils = api.useUtils()
  const { watch } = useImportStatus()
  const [state, setState] = useState<NewImportState>({ step: "choose" })
  const reader = useRef<ImportReader>()

  const drop = useCallback(() => {
    reader.current?.cancel()
    reader.current = undefined
  }, [])
  // Leaving the page ends the reading: the rows go with the worker
  useEffect(() => drop, [drop])

  const choose = useCallback(
    async (file: File) => {
      drop()
      const current = openImportFile(file)
      reader.current = current
      setState({ step: "reading", fileName: file.name })
      try {
        const read = await current.read()
        if (!read.ok) {
          drop()
          return setState({ step: "choose", message: read.message })
        }
        const crm = await utils.client.import.lookup.mutate(read.keys)
        const preview = await current.preview(crm)
        if (reader.current !== current) return
        setState({ step: "preview", fileName: file.name, preview })
      } catch (error) {
        if (error instanceof ImportReadCancelled || reader.current !== current)
          return
        drop()
        setState({
          step: "choose",
          message: messageOf(
            error,
            "L'anteprima non si è potuta calcolare: riprova"
          ),
        })
      }
    },
    [drop, utils]
  )

  const cancel = useCallback(() => {
    drop()
    setState({ step: "choose" })
  }, [drop])

  const downloadReport = useCallback(async () => {
    const current = reader.current
    if (!current) return
    const { fileName, bytes } = await current.report()
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const confirm = useCallback(async () => {
    const current = reader.current
    if (!current || state.step !== "preview") return
    const { fileName, preview } = state
    setState({ step: "sending", fileName, preview })
    try {
      const body = await current.body()
      const { runId } = await uploadAndStart(utils.client.import, {
        body,
        fileName,
        format: preview.format,
        expected: preview.expected,
      })
      drop()
      setState({ step: "started", fileName })
      // The notice of its end follows it from here (D15), the history shows it
      watch(runId)
      await utils.import.list.invalidate()
    } catch (error) {
      if (error instanceof ImportReadCancelled) return
      setState({
        step: "preview",
        fileName,
        preview,
        message: messageOf(error, "L'import non è partito: riprova"),
      })
    }
  }, [drop, state, utils, watch])

  return { state, choose, cancel, confirm, downloadReport }
}
