// @vitest-environment node
import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import {
  DeadlineInvalid,
  NothingToMove,
  NumbersChanged,
  RequestIdConflict,
  WaveNotFound,
} from "../errors"
import {
  AssignInput,
  MoveCandidatesInput,
  MoveInput,
  SetDeadlineInput,
  WaveView,
} from "../import"

const requestId = "0b1f1d4e-5a3c-4f6e-9d0a-1c2b3d4e5f60"

const accepts = <S extends Schema.Decoder<unknown>>(
  schema: S,
  input: unknown
) =>
  Schema.decodeUnknownExit(schema as Schema.Decoder<unknown>)(input)._tag ===
  "Success"

const person = {
  operatorId: 3,
  userId: "user-3",
  name: "Ada Lovelace",
  role: "OPERATORE",
  shown: true,
  pace: 12,
  exactPace: 11.6,
  inactiveDays: null,
  active: 40,
  waveTodo: { toCall: 10, noAnswer: 2 },
}

const wave = {
  name: "WAVE_NOV_2026",
  fileName: "WAVE_NOV_2026.xlsx",
  importedAt: new Date("2026-11-02T09:00:00.000Z"),
  customers: 120,
  today: "2026-11-04",
  deadline: "2026-11-20",
  status: "open",
  workdaysLeft: 12,
  daysSinceDeadline: null,
  origin: {
    new: { withOperator: 5, withoutOperator: 60 },
    existing: { withOperator: 40, withoutOperator: 15 },
    traceRebuilt: false,
  },
  toAssign: 75,
  alreadyAssigned: {
    toCall: 20,
    noAnswer: 5,
    recall: 6,
    outcome: 10,
    noContact: 4,
  },
  parts: {
    unassigned: 75,
    neverCalled: 20,
    calledNoOutcome: 5,
    worked: 16,
    noContact: 4,
  },
  team: [person],
}

describe("the Wave endpoints' schemas", () => {
  it("AssignInput takes a request id and receivers with a count from 0", () => {
    expect(
      accepts(AssignInput, {
        requestId,
        receivers: [{ operatorId: 1, count: 3 }],
      })
    ).toBe(true)
    expect(
      accepts(AssignInput, {
        requestId,
        receivers: [{ operatorId: 1, count: 0 }],
      })
    ).toBe(true)
    expect(
      accepts(AssignInput, {
        requestId,
        receivers: [{ operatorId: 1, count: -1 }],
      })
    ).toBe(false)
    expect(
      accepts(AssignInput, {
        requestId,
        receivers: [{ operatorId: 1, count: 1.5 }],
      })
    ).toBe(false)
  })

  it("AssignInput refuses no request id, a bad one and over 200 receivers", () => {
    expect(accepts(AssignInput, { receivers: [] })).toBe(false)
    expect(accepts(AssignInput, { requestId: "x", receivers: [] })).toBe(false)
    const receivers = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ operatorId: i + 1, count: 1 }))
    expect(accepts(AssignInput, { requestId, receivers: receivers(200) })).toBe(
      true
    )
    expect(accepts(AssignInput, { requestId, receivers: receivers(201) })).toBe(
      false
    )
  })

  it("SetDeadlineInput takes a day and a kind", () => {
    expect(
      accepts(SetDeadlineInput, { deadline: "2026-11-20", kind: "confirm" })
    ).toBe(true)
    expect(
      accepts(SetDeadlineInput, { deadline: "2026-11-20", kind: "extend" })
    ).toBe(true)
    expect(
      accepts(SetDeadlineInput, { deadline: "2026-13-40", kind: "confirm" })
    ).toBe(false)
    expect(
      accepts(SetDeadlineInput, { deadline: "20/11/2026", kind: "confirm" })
    ).toBe(false)
    expect(
      accepts(SetDeadlineInput, { deadline: "2026-11-20", kind: "x" })
    ).toBe(false)
  })

  it("MoveCandidatesInput caps `from` at 200", () => {
    expect(accepts(MoveCandidatesInput, { from: [1, 2] })).toBe(true)
    expect(
      accepts(MoveCandidatesInput, {
        from: Array.from({ length: 201 }, (_, i) => i + 1),
      })
    ).toBe(false)
  })

  it("MoveInput takes which, strategy, contacts and receivers", () => {
    const move = {
      requestId,
      which: "both",
      strategy: "pace",
      contacts: [{ fromOperatorId: 2, taskIds: [10, 11] }],
      receivers: [{ operatorId: 3, count: 2 }],
    }
    expect(accepts(MoveInput, move)).toBe(true)
    expect(accepts(MoveInput, { ...move, which: "recall" })).toBe(false)
    expect(accepts(MoveInput, { ...move, strategy: "random" })).toBe(false)
    const { requestId: _, ...withoutId } = move
    expect(accepts(MoveInput, withoutId)).toBe(false)
    expect(
      accepts(MoveInput, {
        ...move,
        contacts: [
          {
            fromOperatorId: 2,
            taskIds: Array.from({ length: 20_001 }, (_, i) => i + 1),
          },
        ],
      })
    ).toBe(false)
  })

  it("WaveView takes a sample response, with or without a deadline", () => {
    expect(accepts(WaveView, wave)).toBe(true)
    expect(
      accepts(WaveView, {
        ...wave,
        deadline: null,
        status: "unconfirmed",
        workdaysLeft: null,
        daysSinceDeadline: null,
      })
    ).toBe(true)
    expect(accepts(WaveView, { ...wave, status: "closed" })).toBe(false)
    expect(
      accepts(WaveView, { ...wave, team: [{ ...person, role: "X" }] })
    ).toBe(false)
  })

  it("the new errors carry the status of their tRPC code", () => {
    const status = (error: unknown) =>
      (error as { ast: { annotations: { httpApiStatus?: number } } }).ast
        .annotations.httpApiStatus
    expect(status(WaveNotFound)).toBe(404)
    expect(status(DeadlineInvalid)).toBe(400)
    expect(status(NumbersChanged)).toBe(409)
    expect(status(NothingToMove)).toBe(409)
    expect(status(RequestIdConflict)).toBe(409)
  })
})
