import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  type ImportAlreadyRunning,
  type ImportInputInvalid,
  type ImportUnavailable,
} from "@mito/contract/errors"
import {
  type CrmState,
  type ImportSummary,
  type LookupKeys,
  type UploadPart,
} from "@mito/contract/import"
import { type FakeHandlers, type GroupService } from "./api"

/** An import as the history and `active` give it: Anna Rossi's, running */
export const importRun = (
  overrides: Partial<ImportSummary> = {}
): ImportSummary => ({
  id: 7,
  startedAt: new Date("2026-10-25T09:05:00Z"),
  finishedAt: null,
  startedBy: "Anna Rossi",
  fileName: "wave_ottobre.xlsx",
  format: "wave",
  status: "running",
  failureReason: null,
  rowsTotal: 120,
  rowsDiscarded: 3,
  customersCreated: null,
  customersUpdated: null,
  practicesCreated: null,
  practicesUpdated: null,
  linksCreated: null,
  durationMs: null,
  ...overrides,
})

/** The same import, completed */
export const completedRun = importRun({
  status: "completed",
  finishedAt: new Date("2026-10-25T09:05:12Z"),
  durationMs: 12_000,
  customersCreated: 40,
  customersUpdated: 12_000,
  practicesCreated: 50,
  practicesUpdated: 67,
  linksCreated: 90,
})

/**
 * A backend in memory for the group `import`: the latest import (`active`),
 * the history, and a new import (lookup, upload, start), with what each call
 * asked for, in order
 */
export function fakeImport(
  initial: {
    active?: ImportSummary | null
    imports?: ImportSummary[]
    total?: number
    crm?: CrmState
  } = {}
) {
  const imports = initial.imports ?? []
  const state = {
    active: initial.active ?? null,
    imports,
    total: initial.total ?? imports.length,
    crm: initial.crm ?? { customers: [], praticaIds: [], links: [] },
    // The endpoints called, in order
    calls: [] as string[],
    lookups: [] as LookupKeys[],
    uploads: [] as UploadPart[],
    starts: [] as Array<{ uploadId: string; rows: readonly number[] }>,
    pages: [] as number[],
    // A refusal of the server for `start`
    startRejected: undefined as
      ImportAlreadyRunning | ImportUnavailable | ImportInputInvalid | undefined,
    // These don't answer: a 500
    failingLookup: false,
    failingUpload: false,
    failingList: false,
  }

  const answer = <A>(name: string, failing: boolean, read: () => A) =>
    Effect.suspend(() => {
      state.calls.push(name)
      return failing ? Effect.die("backend down") : Effect.succeed(read())
    })

  const handlers: FakeHandlers<GroupService<"import">> = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "import", (handlers) =>
      handlers
        .handle("lookup", ({ payload }) =>
          answer("lookup", state.failingLookup, () => {
            state.lookups.push(payload)
            return state.crm
          })
        )
        .handle("upload", ({ payload }) =>
          answer("upload", state.failingUpload, () => {
            state.uploads.push(payload)
            return { uploadId: "u-1" }
          })
        )
        .handle("start", ({ payload }) =>
          Effect.suspend(() => {
            state.calls.push("start")
            if (state.startRejected) return Effect.fail(state.startRejected)
            state.starts.push(payload)
            return Effect.succeed({ runId: 7 })
          })
        )
        .handle("active", () => answer("active", false, () => state.active))
        .handle("list", ({ query }) =>
          answer("list", state.failingList, () => {
            state.pages.push(query.page)
            return { imports: state.imports, total: state.total }
          })
        )
    )
  )

  /** How many times `name` was called */
  const asked = (name: string) =>
    state.calls.filter((call) => call === name).length

  return { state, handlers, asked }
}
