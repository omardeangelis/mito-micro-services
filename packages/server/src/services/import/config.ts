import { Context, Layer } from "effect"

export type ImportSettings = {
  /** An import not finished this long after its start is interrupted (AC30) */
  readonly timeoutMs: number
  /** The rows of a file wait for their import this long at most (D14) */
  readonly uploadTtlMs: number
  /** Rows per INSERT or UPDATE (D5) */
  readonly batchSize: number
}

/** The limits of the import: tests shorten them. */
export class ImportConfig extends Context.Service<
  ImportConfig,
  ImportSettings
>()("ImportConfig") {}

export const importSettings: ImportSettings = {
  timeoutMs: 30 * 60_000,
  uploadTtlMs: 60 * 60_000,
  batchSize: 1_000,
}

export const ImportConfigLive = Layer.succeed(ImportConfig, importSettings)
