import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { Effect, Option } from "effect"
import { waveOperation } from "@mito/db/schema/waveOperation"
import { type Db, DbError, Tx, query } from "../../../effect/db"
import { RequestIdConflict } from "./errors"

// The idempotency of the Wave's writes (spec assegnazione-wave, D4), on the
// model of `registerCall`: one `wave_operation` row per request, written in
// the transaction of the write. A request that arrives again with the same
// `requestId` gets the stored result without writing; a different request
// with that id is `RequestIdConflict`

/** Postgres' unique violation: a concurrent request inserted the same id */
const UNIQUE_VIOLATION = "23505"

/** A write of the Wave as `wave_operation` records it */
export type WaveOperation = {
  readonly requestId: string
  readonly runId: number
  readonly kind: "assign" | "move"
  readonly actorOperatorId: number
  /** The request without `requestId`: its hash tells a repeat from another request */
  readonly payload: unknown
}

/** JSON with the keys of every object sorted, so equal payloads hash equal */
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map(
            (key) =>
              `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
          )
          .join(",")}}`
      : JSON.stringify(value)

/** The sha256 of the canonical JSON of `payload`, in hex */
export const payloadHash = (payload: unknown) =>
  createHash("sha256").update(canonical(payload)).digest("hex")

/**
 * The stored result of `operation` if its `requestId` was already recorded,
 * by the same kind of write, on the same Wave, by the same admin and with the
 * same payload; another request with that id is `RequestIdConflict`; none,
 * `Option.none()`. In the write's transaction, after its locks (D11): a repeat
 * that waited on them finds the row of the first
 */
export const storedResult = Effect.fn("import.storedResult")(function* <A>(
  operation: WaveOperation
): Effect.fn.Return<Option.Option<A>, RequestIdConflict | DbError, Db> {
  const [row] = yield* query((client) =>
    client
      .select()
      .from(waveOperation)
      .where(eq(waveOperation.requestId, operation.requestId))
  )
  if (!row) return Option.none()
  if (
    row.kind !== operation.kind ||
    row.runId !== operation.runId ||
    row.actorOperatorId !== operation.actorOperatorId ||
    row.payloadHash !== payloadHash(operation.payload)
  ) {
    return yield* new RequestIdConflict()
  }
  // The row was written by `recordOperation` of the same kind of write
  return Option.some(row.result as A)
})

/** Records `operation` with its `result`, in the write's transaction */
export const recordOperation = Effect.fn("import.recordOperation")(function* <
  A,
>(
  operation: WaveOperation,
  result: A
): Effect.fn.Return<void, DbError, Db | Tx> {
  yield* Tx
  yield* query((client) =>
    client.insert(waveOperation).values({
      requestId: operation.requestId,
      runId: operation.runId,
      kind: operation.kind,
      actorOperatorId: operation.actorOperatorId,
      payloadHash: payloadHash(operation.payload),
      result,
    })
  )
})

/**
 * Around the write's transaction: when it failed on a unique violation (a
 * concurrent request with the same id committed its row first, and Postgres
 * aborted this one), the row is read again outside it and its result returned,
 * or `RequestIdConflict`. Any other failure, or no row, stays as it was
 */
export const repeatOnDuplicate =
  (operation: WaveOperation) =>
  <A, E, R>(
    program: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | RequestIdConflict | DbError, R | Db> =>
    program.pipe(
      Effect.catchIf(
        (error): error is E & DbError =>
          error instanceof DbError && error.code === UNIQUE_VIOLATION,
        (error) =>
          storedResult<A>(operation).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(error),
                onSome: (result) => Effect.succeed(result),
              })
            )
          )
      )
    )
