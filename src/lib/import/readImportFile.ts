import { type ImportFormat } from "@mito/domain/import/formats"
import { type LookupKeys } from "@mito/domain/import/payload"
import { type CrmState } from "@mito/domain/import/plan"
import { fileProblem } from "./messages"
import { type Preview } from "./session"

// The page's side of the worker of the import (T14, D2): one worker per file,
// asked one thing at a time. Ending it (`cancel`, AC17, AC18) stops the reading
// at once, whatever it was doing, and drops the rows it held

export type ReaderRequest =
  | { type: "read"; file: Blob; fileName: string; now: number }
  | { type: "preview"; crm: CrmState }
  | { type: "body" }
  | { type: "report"; today: number }

export type ReaderResponse =
  | {
      type: "read"
      result:
        | { ok: false; message: string }
        | { ok: true; format: ImportFormat; keys: LookupKeys }
    }
  | { type: "preview"; preview: Preview }
  | { type: "body"; body: Uint8Array }
  | { type: "report"; fileName: string; bytes: Uint8Array<ArrayBuffer> }
  | { type: "failed" }

/** What the page needs of a `Worker`, so that tests can give their own. */
export type ReaderWorker = {
  postMessage: (message: ReaderRequest) => void
  terminate: () => void
  onmessage: ((event: MessageEvent<ReaderResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** The reading was cancelled: nothing to show. */
export class ImportReadCancelled extends Error {
  constructor() {
    super("Lettura annullata")
  }
}

/** The worker failed: its reason stays in it, since it could hold row values. */
export class ImportReadFailed extends Error {
  constructor() {
    super("Il file non si legge: riprova o controlla il file")
  }
}

const moduleWorker = () =>
  new Worker(new URL("./read.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as ReaderWorker

export type ImportReader = ReturnType<typeof openImportFile>

/**
 * Starts reading a file: the checks of AC5 first, without reading it, then the
 * worker. `signal` cancels it, like `cancel`.
 */
export function openImportFile(
  file: File,
  {
    signal,
    now = new Date(),
    createWorker = moduleWorker,
  }: {
    signal?: AbortSignal
    now?: Date
    createWorker?: () => ReaderWorker
  } = {}
) {
  const problem = fileProblem(file)
  let worker: ReaderWorker | undefined
  let pending:
    | {
        resolve: (response: ReaderResponse) => void
        reject: (error: Error) => void
      }
    | undefined

  const cancel = () => {
    worker?.terminate()
    worker = undefined
    pending?.reject(new ImportReadCancelled())
    pending = undefined
  }
  signal?.addEventListener("abort", cancel, { once: true })

  const ask = (request: ReaderRequest) =>
    new Promise<ReaderResponse>((resolve, reject) => {
      if (!worker) return reject(new ImportReadCancelled())
      if (pending) return reject(new Error("The worker is busy"))
      pending = { resolve, reject }
      worker.postMessage(request)
    })

  const answer = <T extends ReaderResponse["type"]>(
    response: ReaderResponse,
    type: T
  ) => {
    if (response.type !== type) throw new ImportReadFailed()
    return response as Extract<ReaderResponse, { type: T }>
  }

  const read = async () => {
    if (problem) return { ok: false as const, message: problem }
    if (signal?.aborted) throw new ImportReadCancelled()
    worker = createWorker()
    worker.onmessage = ({ data }) => {
      const current = pending
      pending = undefined
      current?.resolve(data)
    }
    worker.onerror = () => {
      const current = pending
      pending = undefined
      current?.reject(new ImportReadFailed())
    }
    const response = await ask({
      type: "read",
      file,
      fileName: file.name,
      now: now.getTime(),
    })
    return answer(response, "read").result
  }

  return {
    read,
    /** The preview, given what `import.lookup` found for the keys */
    preview: async (crm: CrmState) =>
      answer(await ask({ type: "preview", crm }), "preview").preview,
    /** The rows gzipped, for `import.upload` */
    body: async () => answer(await ask({ type: "body" }), "body").body,
    report: async (today = new Date()) => {
      const { fileName, bytes } = answer(
        await ask({ type: "report", today: today.getTime() }),
        "report"
      )
      return { fileName, bytes }
    },
    cancel,
  }
}
