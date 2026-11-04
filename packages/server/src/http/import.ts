import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { z } from "zod"
import { MitoApi } from "@mito/contract/api"
import * as Api from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import {
  lookupKeysSchema,
  startImportSchema,
  uploadPartSchema,
} from "@mito/domain/import/payload"
import { type Db, type DbError } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { type CallsRegistryMissing } from "../services/export/callStats"
import { type ImportError } from "../services/import/errors"
import { activeImport, listImports } from "../services/import/history"
import { importLayer } from "../services/import/live"
import { lookupExisting } from "../services/import/lookup"
import { startImport } from "../services/import/run"
import { beginUpload, saveUploadPart } from "../services/import/upload"
import { assignWave } from "../services/import/wave/assign"
import { setDeadline } from "../services/import/wave/deadline"
import { move, moveCandidates } from "../services/import/wave/move"
import { type WaveError } from "../services/import/wave/errors"
import { readWave } from "../services/import/wave/read"
import { unexpectedAs500 } from "./unexpected"

/** The input of `list`, as the procedure's */
const listInput = z.object({ page: z.number().int().min(1).max(100_000) })

/**
 * The input checked by the procedure's own schema, so the limits stay the
 * same: what it rejects is `ImportInputInvalid`, the procedure's BAD_REQUEST
 */
const parsed = <T>(schema: z.ZodType<T>, input: unknown) =>
  Effect.suspend(() => {
    const result = schema.safeParse(input)
    return result.success
      ? Effect.succeed(result.data)
      : Effect.fail(
          new Api.ImportInputInvalid({
            reason: result.error.issues[0]?.message ?? "Richiesta non valida",
          })
        )
  })

/** What `toApiErrors` maps: the import's errors, the Wave's and its own input check */
type ImportFailure = ImportError | WaveError | Api.ImportInputInvalid

/** The error of the contract with the tag of `E` */
type ApiErrorOf<E> = E extends { readonly _tag: infer Tag }
  ? Extract<Api.ApiError, { readonly _tag: Tag }>
  : never

/**
 * The import's errors as those of the contract, as `importErrorToTrpc`: one
 * entry per tag, each typed to return the contract's error of its own tag, so
 * a wrong one fails `tsc`
 */
const apiErrors: {
  [Tag in ImportFailure["_tag"]]: (
    error: Extract<ImportFailure, { readonly _tag: Tag }>
  ) => ApiErrorOf<{ readonly _tag: Tag }>
} = {
  ImportInputInvalid: (error) =>
    new Api.ImportInputInvalid({ reason: error.reason }),
  ImportUploadMissing: () => new Api.ImportUploadMissing(),
  ImportUploadClosed: () => new Api.ImportUploadClosed(),
  ImportRowRejected: (error) =>
    new Api.ImportRowRejected({ row: error.row, rule: error.rule }),
  ImportTimedOut: () => new Api.ImportTimedOut(),
  ImportAlreadyRunning: (error) =>
    new Api.ImportAlreadyRunning({
      startedBy: error.startedBy,
      time: error.time,
    }),
  ImportUnavailable: () => new Api.ImportUnavailable(),
  ImportQueueFailed: () => new Api.ImportQueueFailed(),
  WaveNotFound: () => new Api.WaveNotFound(),
  DeadlineInvalid: () => new Api.DeadlineInvalid(),
  NumbersChanged: () => new Api.NumbersChanged(),
  NothingToMove: () => new Api.NothingToMove(),
  RequestIdConflict: () => new Api.RequestIdConflict(),
}

/** `error` as the contract's, by its tag */
const apiError = (error: ImportFailure) =>
  (apiErrors[error._tag] as (error: ImportFailure) => Api.ApiError)(error)

/** What `toApiErrors` leaves to `unexpectedAs500`: a 500 */
type Unexpected = DbError | CallsRegistryMissing

/**
 * The failures of an import's program as those of the contract, tag by tag,
 * so each endpoint declares only its own; `DbError` and
 * `CallsRegistryMissing` stay
 */
const toApiErrors = <A, E extends ImportFailure | Unexpected, R>(
  program: Effect.Effect<A, E, R>
) =>
  program.pipe(
    Effect.mapError((error) =>
      error._tag === "DbError" || error._tag === "CallsRegistryMissing"
        ? error
        : apiError(error)
    )
  ) as Effect.Effect<
    A,
    ApiErrorOf<Exclude<E, Unexpected>> | Extract<E, Unexpected>,
    R
  >

/**
 * The group `import`: adapters of the services the procedures of the tRPC
 * router `import` call, with no logic of their own (H16). Each call has the
 * queue and the limits of the import (`importLayer`), as `runImport` of the
 * procedures
 */
export const importGroupLayer = HttpApiBuilder.group(
  MitoApi,
  "import",
  (handlers) =>
    Effect.gen(function* () {
      // The database and the reporter of the layer, so the handlers need
      // nothing per request but `CurrentUser`
      const services = yield* Effect.context<Db | ErrorReporter>()
      return handlers
        .handle("lookup", ({ payload }) =>
          parsed(lookupKeysSchema, payload).pipe(
            Effect.flatMap((keys) => lookupExisting(keys)),
            unexpectedAs500("lookup"),
            Effect.provide(services)
          )
        )
        .handle("upload", ({ payload }) =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            const input = yield* parsed(uploadPartSchema, payload)
            const createdBy = operator.userId
            const data = new Uint8Array(Buffer.from(input.data, "base64"))
            if ("uploadId" in input) {
              yield* saveUploadPart({
                uploadId: input.uploadId,
                createdBy,
                part: input.part,
                data,
              })
              return { uploadId: input.uploadId }
            }
            const uploadId = yield* beginUpload({
              createdBy,
              fileName: input.fileName,
              format: input.format,
              parts: input.parts,
              data,
            })
            return { uploadId }
          }).pipe(
            toApiErrors,
            Effect.provide(importLayer),
            unexpectedAs500("upload"),
            Effect.provide(services)
          )
        )
        .handle("start", ({ payload }) =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            const input = yield* parsed(startImportSchema, payload)
            return yield* startImport({
              uploadId: input.uploadId,
              expected: input.rows,
              startedBy: operator.userId,
            })
          }).pipe(
            toApiErrors,
            Effect.provide(importLayer),
            unexpectedAs500("start"),
            Effect.provide(services)
          )
        )
        .handle("active", () =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            return yield* activeImport(operator.userId)
          }).pipe(
            Effect.provide(importLayer),
            unexpectedAs500("active"),
            Effect.provide(services)
          )
        )
        .handle("list", ({ query }) =>
          parsed(listInput, query).pipe(
            Effect.flatMap(({ page }) => listImports(page)),
            Effect.provide(importLayer),
            unexpectedAs500("list"),
            Effect.provide(services)
          )
        )
        .handle("wave", ({ params }) =>
          readWave(params.id).pipe(
            toApiErrors,
            unexpectedAs500("wave"),
            Effect.provide(services)
          )
        )
        .handle("setDeadline", ({ params, payload }) =>
          setDeadline(params.id, payload).pipe(
            toApiErrors,
            unexpectedAs500("setDeadline"),
            Effect.provide(services)
          )
        )
        .handle("assign", ({ params, payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* assignWave({
              runId: params.id,
              requestId: payload.requestId,
              actorOperatorId: actor.operatorId,
              receivers: payload.receivers,
            })
          }).pipe(
            // Past its 60 s (D17): a 500, the uncertain outcome of the web
            Effect.catchTag("WaveTimedOut", (error) => Effect.die(error)),
            toApiErrors,
            unexpectedAs500("assign"),
            Effect.provide(services)
          )
        )
        .handle("moveCandidates", ({ params, payload }) =>
          moveCandidates(params.id, payload.from).pipe(
            toApiErrors,
            unexpectedAs500("moveCandidates"),
            Effect.provide(services)
          )
        )
        .handle("move", ({ params, payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* move({
              runId: params.id,
              requestId: payload.requestId,
              actorOperatorId: actor.operatorId,
              which: payload.which,
              strategy: payload.strategy,
              contacts: payload.contacts,
              receivers: payload.receivers,
            })
          }).pipe(
            // Past its 60 s (D17): a 500, the uncertain outcome of the web
            Effect.catchTag("WaveTimedOut", (error) => Effect.die(error)),
            toApiErrors,
            unexpectedAs500("move"),
            Effect.provide(services)
          )
        )
    })
)
