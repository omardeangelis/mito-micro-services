/// <reference lib="webworker" />
import { type ReaderRequest, type ReaderResponse } from "./readImportFile"
import {
  type ImportSession,
  compressedBody,
  errorReport,
  previewImport,
  readImport,
} from "./session"

// The worker of the import (D2): the file and its rows stay here, and so do
// its errors, which could hold row values. Nothing goes to the console (AC31)

declare const self: DedicatedWorkerGlobalScope

let session: ImportSession | undefined

const reply = (response: ReaderResponse, transfer: Transferable[] = []) =>
  self.postMessage(response, transfer)

const handle = async (request: ReaderRequest) => {
  switch (request.type) {
    case "read": {
      const result = readImport(
        await request.file.arrayBuffer(),
        request.fileName,
        new Date(request.now)
      )
      session = result.ok ? result.session : undefined
      return reply({
        type: "read",
        result: result.ok
          ? { ok: true, format: result.session.format, keys: result.keys }
          : result,
      })
    }
    case "preview":
      if (!session) return reply({ type: "failed" })
      return reply({
        type: "preview",
        preview: previewImport(session, request.crm),
      })
    case "body": {
      if (!session) return reply({ type: "failed" })
      const body = await compressedBody(session)
      return reply({ type: "body", body }, [body.buffer])
    }
    case "report": {
      if (!session) return reply({ type: "failed" })
      const { fileName, bytes } = errorReport(session, new Date(request.today))
      return reply({ type: "report", fileName, bytes }, [bytes.buffer])
    }
  }
}

self.onmessage = (event: MessageEvent<ReaderRequest>) => {
  handle(event.data).catch(() => reply({ type: "failed" }))
}
