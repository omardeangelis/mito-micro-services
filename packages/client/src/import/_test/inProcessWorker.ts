import {
  type ReaderRequest,
  type ReaderResponse,
  type ReaderWorker,
} from "../readImportFile"
import {
  type ImportSession,
  compressedBody,
  errorReport,
  previewImport,
  readImport,
} from "../session"

/** A worker in this process, running what read.worker.ts runs. */
export const inProcessWorker = () => {
  let session: ImportSession | undefined
  const worker: ReaderWorker & { terminated: boolean; requests: string[] } = {
    terminated: false,
    requests: [],
    onmessage: null,
    onerror: null,
    terminate: () => {
      worker.terminated = true
    },
    postMessage: (request: ReaderRequest) => {
      worker.requests.push(request.type)
      void (async (): Promise<ReaderResponse> => {
        switch (request.type) {
          case "read": {
            const result = readImport(
              await request.file.arrayBuffer(),
              request.fileName,
              new Date(request.now)
            )
            session = result.ok ? result.session : undefined
            return {
              type: "read",
              result: result.ok
                ? { ok: true, format: result.session.format, keys: result.keys }
                : result,
            }
          }
          case "preview":
            return {
              type: "preview",
              preview: previewImport(session!, request.crm),
            }
          case "body":
            return { type: "body", body: await compressedBody(session!) }
          case "report":
            return {
              type: "report",
              ...errorReport(session!, new Date(request.today)),
            }
        }
      })().then((data) => {
        if (!worker.terminated) {
          worker.onmessage?.({ data } as MessageEvent<ReaderResponse>)
        }
      })
    },
  }
  return worker
}
