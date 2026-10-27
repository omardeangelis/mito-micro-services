import { type ImportFormat } from "@mito/domain/import/formats"
import {
  MAX_UPLOAD_PARTS,
  type StartImport,
  UPLOAD_PART_BYTES,
  type UploadPart,
} from "@mito/domain/import/payload"

// The confirmation of an import (D3): the compressed rows go in parts of at
// most `UPLOAD_PART_BYTES`, one request at a time, then `import.start` with the
// rows the preview expects (D10). The import exists only once `start` answers:
// closing the tab before that leaves nothing behind but the upload, which its
// cleanup deletes within an hour (D14)

/** The procedures of the confirmation, as the tRPC client has them. */
export type ImportClient = {
  upload: { mutate: (input: UploadPart) => Promise<{ uploadId: string }> }
  start: { mutate: (input: StartImport) => Promise<{ runId: number }> }
}

/** A body bigger than `import.upload` takes, in parts. */
export const tooBigToSend = "Il file è troppo grande per l'import"

/** Base64 of bytes, a slice at a time: one call with all of them overflows the stack. */
export function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

export async function uploadAndStart(
  client: ImportClient,
  input: {
    body: Uint8Array
    fileName: string
    format: ImportFormat
    expected: number[]
  }
) {
  const parts = Math.max(1, Math.ceil(input.body.length / UPLOAD_PART_BYTES))
  if (parts > MAX_UPLOAD_PARTS) throw new Error(tooBigToSend)
  const part = (index: number) =>
    toBase64(
      input.body.subarray(
        index * UPLOAD_PART_BYTES,
        (index + 1) * UPLOAD_PART_BYTES
      )
    )
  const { uploadId } = await client.upload.mutate({
    fileName: input.fileName,
    format: input.format,
    parts,
    data: part(0),
  })
  for (let index = 1; index < parts; index++) {
    await client.upload.mutate({ uploadId, part: index, data: part(index) })
  }
  return client.start.mutate({ uploadId, rows: input.expected })
}
