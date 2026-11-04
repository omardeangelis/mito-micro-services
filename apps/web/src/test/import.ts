import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  DeadlineInvalid,
  type ImportAlreadyRunning,
  type ImportInputInvalid,
  type ImportUnavailable,
  NothingToMove,
  NumbersChanged,
  RequestIdConflict,
  WaveNotFound,
} from "@mito/contract/errors"
import {
  type AssignInput,
  type CrmState,
  type ImportSummary,
  type LookupKeys,
  type MoveCandidates,
  type MoveInput,
  type SetDeadlineInput,
  type UploadPart,
  type WaveView,
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

/** A Wave as `wave` gives it: four customers to assign, one team member, the deadline open */
export const waveView = (overrides: Partial<WaveView> = {}): WaveView => ({
  name: "wave_ottobre",
  fileName: "wave_ottobre.xlsx",
  importedAt: new Date("2026-10-25T09:05:12Z"),
  customers: 10,
  today: "2026-11-04",
  deadline: "2026-11-20",
  status: "open",
  workdaysLeft: 12,
  daysSinceDeadline: null,
  origin: {
    new: { withOperator: 2, withoutOperator: 3 },
    existing: { withOperator: 3, withoutOperator: 2 },
    traceRebuilt: false,
  },
  toAssign: 4,
  alreadyAssigned: {
    toCall: 2,
    noAnswer: 1,
    recall: 1,
    outcome: 1,
    noContact: 1,
  },
  parts: {
    unassigned: 4,
    neverCalled: 3,
    calledNoOutcome: 1,
    worked: 1,
    noContact: 1,
  },
  team: [
    {
      operatorId: 7,
      name: "Ada Lovelace",
      role: "OPERATORE",
      shown: true,
      pace: 20,
      exactPace: 20.2,
      inactiveDays: null,
      active: 5,
      waveTodo: { toCall: 2, noAnswer: 1 },
    },
  ],
  ...overrides,
})

/**
 * How an endpoint of the Wave ends instead of answering: a declared error of
 * the contract, or `uncertain` (the backend dies: the client sees
 * `ApiUnavailable`). The session (`Unauthorized`, `OperatorDisabled`) and the
 * permission (`NotAdmin`) are the middleware's, not the handler's: a test
 * gives `renderWithApi` `rejectingWith(…)` or `signedInAs(ada, "OPERATORE")`
 */
export type WaveOutcome =
  | "uncertain"
  | "waveNotFound"
  | "numbersChanged"
  | "nothingToMove"
  | "requestIdConflict"
  | "deadlineInvalid"

const waveErrors = {
  waveNotFound: () => new WaveNotFound(),
  numbersChanged: () => new NumbersChanged(),
  nothingToMove: () => new NothingToMove(),
  requestIdConflict: () => new RequestIdConflict(),
  deadlineInvalid: () => new DeadlineInvalid(),
}

/** The failure of an outcome, typed as the errors of `O` */
function failWith<O extends WaveOutcome>(
  outcome: O
): Effect.Effect<
  never,
  ReturnType<(typeof waveErrors)[Exclude<O, "uncertain">]>
>
function failWith(outcome: WaveOutcome) {
  return outcome === "uncertain"
    ? Effect.die("backend down")
    : Effect.fail(waveErrors[outcome]())
}

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
    wave?: WaveView
    candidates?: MoveCandidates["candidates"]
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
    failingActive: false,
    // The Wave `wave` answers: `setDeadline` and `assign` change it
    wave: initial.wave ?? waveView(),
    // What `moveCandidates` answers, for the givers asked
    candidates: initial.candidates ?? ([] as MoveCandidates["candidates"]),
    // An endpoint of the Wave with an outcome set ends with it, at every call
    outcome: {} as {
      wave?: "uncertain" | "waveNotFound"
      setDeadline?:
        | "uncertain"
        // The deadline is saved, then the backend dies before it answers
        | "uncertainAfterWrite"
        | "waveNotFound"
        | "deadlineInvalid"
      assign?:
        "uncertain" | "waveNotFound" | "numbersChanged" | "requestIdConflict"
      moveCandidates?: "uncertain" | "waveNotFound"
      move?:
        | "uncertain"
        | "waveNotFound"
        | "numbersChanged"
        | "nothingToMove"
        | "requestIdConflict"
    },
    // What the Wave endpoints were asked, in order
    waveReads: [] as number[],
    deadlines: [] as Array<{ id: number; input: SetDeadlineInput }>,
    assigns: [] as Array<{ id: number; input: AssignInput }>,
    candidateReads: [] as Array<{ id: number; from: readonly number[] }>,
    moves: [] as Array<{ id: number; input: MoveInput }>,
    // What `move` answers instead of moving everything: `skipped` of the checks of D13
    moveResult: undefined as { moved: number; skipped: number } | undefined,
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
        .handle("active", () =>
          answer("active", state.failingActive, () => state.active)
        )
        .handle("list", ({ query }) =>
          answer("list", state.failingList, () => {
            state.pages.push(query.page)
            return { imports: state.imports, total: state.total }
          })
        )
        .handle("wave", ({ params }) =>
          Effect.suspend(() => {
            state.calls.push("wave")
            state.waveReads.push(params.id)
            const outcome = state.outcome.wave
            return outcome ? failWith(outcome) : Effect.succeed(state.wave)
          })
        )
        .handle("setDeadline", ({ params, payload }) =>
          Effect.suspend(() => {
            state.calls.push("setDeadline")
            state.deadlines.push({ id: params.id, input: payload })
            const outcome = state.outcome.setDeadline
            if (outcome === "uncertainAfterWrite") {
              state.wave = {
                ...state.wave,
                deadline: payload.deadline,
                status: "open",
              }
              return failWith("uncertain")
            }
            if (outcome) return failWith(outcome)
            const before = state.wave.deadline
            state.wave = {
              ...state.wave,
              deadline: payload.deadline,
              status: "open",
            }
            return Effect.succeed({ before, after: payload.deadline })
          })
        )
        .handle("assign", ({ params, payload }) =>
          Effect.suspend(() => {
            state.calls.push("assign")
            state.assigns.push({ id: params.id, input: payload })
            const outcome = state.outcome.assign
            if (outcome) return failWith(outcome)
            const assigned = state.wave.toAssign
            state.wave = {
              ...state.wave,
              toAssign: 0,
              parts: { ...state.wave.parts, unassigned: 0 },
            }
            return Effect.succeed({
              assigned,
              byOperator: payload.receivers.map((receiver) => ({
                ...receiver,
              })),
              remaining: 0,
            })
          })
        )
        .handle("moveCandidates", ({ params, payload }) =>
          Effect.suspend(() => {
            state.calls.push("moveCandidates")
            state.candidateReads.push({ id: params.id, from: payload.from })
            const outcome = state.outcome.moveCandidates
            if (outcome) return failWith(outcome)
            return Effect.succeed({
              candidates: state.candidates.filter((candidate) =>
                payload.from.includes(candidate.operatorId)
              ),
            })
          })
        )
        .handle("move", ({ params, payload }) =>
          Effect.suspend(() => {
            state.calls.push("move")
            state.moves.push({ id: params.id, input: payload })
            const outcome = state.outcome.move
            if (outcome) return failWith(outcome)
            return Effect.succeed({
              moved: payload.contacts.reduce(
                (sum, giver) => sum + giver.taskIds.length,
                0
              ),
              skipped: 0,
              ...state.moveResult,
              byOperator: payload.receivers.map((receiver) => ({
                ...receiver,
              })),
            })
          })
        )
    )
  )

  /** How many times `name` was called */
  const asked = (name: string) =>
    state.calls.filter((call) => call === name).length

  return { state, handlers, asked }
}
