import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect, Exit, Layer } from "effect"
import { Hono } from "hono"
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose"
import { importRun, importUpload } from "@mito/db/schema/importRun"
import { waveColumns } from "@mito/domain/import/formats"
import { toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { ServerLive } from "@mito/server/effect/server"
import { ImportConfigLive } from "@mito/server/services/import/config"
import {
  ImportQueue,
  type ImportTask,
} from "@mito/server/services/import/queue"
import { startImport } from "@mito/server/services/import/run"
import { createUpload } from "@mito/server/services/import/upload"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createUser } from "@/test/factories"
import { importAuth, importAuthDisabled } from "../auth"
import { importRoutes } from "../routes"

// The route of the import queue's tasks (T10a, D13): only Cloud Tasks, with
// the token of the queue's service account for the URL of the service

const SERVICE = "https://mito-crm-staging.example.run.app"
const TASKS_ACCOUNT =
  "mito-crm-import-tasks-staging@mito-crm.iam.gserviceaccount.com"

let googleKey: CryptoKey
let keys: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  await migrateUpTo()
  const pair = await generateKeyPair("RS256")
  googleKey = pair.privateKey
  keys = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(pair.publicKey)), kid: "google", alg: "RS256" },
    ],
  })
})

beforeEach(async () => {
  await resetDb()
  queued.length = 0
})

/** An ID token as Google signs it for the queue, with `claims` changed. */
const idToken = (claims: JWTPayload & { email_verified?: boolean } = {}) =>
  new SignJWT({
    iss: "https://accounts.google.com",
    aud: SERVICE,
    email: TASKS_ACCOUNT,
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "google" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(googleKey)

const queued: ImportTask[] = []
const recordingQueue = Layer.succeed(ImportQueue, {
  available: true,
  enqueue: (task) => Effect.sync(() => void queued.push(task)),
})

const appWith = (
  auth = importAuth({ audience: SERVICE, serviceAccount: TASKS_ACCOUNT }, keys)
) =>
  new Hono().route(
    "/internal/import",
    importRoutes(
      Layer.mergeAll(ServerLive, ImportConfigLive, recordingQueue, auth)
    )
  )

const call = async (path: string, authorization?: string, app = appWith()) => {
  const response = await app.request(`/internal/import${path}`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
  })
  return { status: response.status, body: (await response.json()) as unknown }
}

/** A confirmed import of a Wave row, waiting for its task. */
const startedImport = async (
  rows = [{ "n° Pratica": "P1", "Codice NDG": "1" }]
) => {
  const admin = await createUser({ role: "ADMIN" })
  const program = Effect.gen(function* () {
    const uploadId = yield* createUpload({
      createdBy: admin.id,
      fileName: "0125_import.xlsx",
      format: "wave",
      parts: 1,
      data: gzipSync(
        JSON.stringify(
          toFileBody(
            waveColumns,
            rows.map((cells, index) => ({
              row: index + 2,
              cells: waveCells(cells),
            }))
          )
        )
      ),
    })
    return yield* startImport({
      uploadId,
      expected: rows.map((_, index) => index + 2),
      startedBy: admin.id,
    })
  })
  const exit = await Effect.runPromiseExit(
    program.pipe(
      Effect.provide(
        Layer.mergeAll(
          ServerLive,
          ImportConfigLive,
          Layer.succeed(ImportQueue, {
            available: true,
            enqueue: () => Effect.void,
          })
        )
      )
    )
  )
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
  return exit.value.runId
}

const runRow = async () => (await testDb.select().from(importRun))[0]

describe("POST /internal/import/run/:id", () => {
  it("con il token della coda per l'URL del servizio esegue l'import", async () => {
    const runId = await startedImport()

    const response = await call(`/run/${runId}`, `Bearer ${await idToken()}`)

    expect(response).toEqual({
      status: 200,
      body: { outcome: "completed" },
    })
    expect(await runRow()).toMatchObject({
      status: "completed",
      practicesCreated: 1,
    })
  })

  it.each([
    ["senza token", async () => undefined],
    [
      "con il token di un altro service account",
      async () =>
        `Bearer ${await idToken({ email: "intruder@mito-crm.iam.gserviceaccount.com" })}`,
    ],
    [
      "con il token per l'URL del task invece che del servizio",
      async () =>
        `Bearer ${await idToken({ aud: `${SERVICE}/internal/import/run/1` })}`,
    ],
    [
      "con l'email non verificata",
      async () => `Bearer ${await idToken({ email_verified: false })}`,
    ],
  ])("%s risponde 401 e non esegue niente", async (_, authorization) => {
    const runId = await startedImport()

    const response = await call(`/run/${runId}`, await authorization())

    expect(response.status).toBe(401)
    expect(await runRow()).toMatchObject({ status: "running", claimedAt: null })
  })

  it("senza la configurazione rifiuta ogni task, anche con un token valido", async () => {
    const runId = await startedImport()

    const response = await call(
      `/run/${runId}`,
      `Bearer ${await idToken()}`,
      appWith(importAuthDisabled)
    )

    expect(response.status).toBe(503)
    expect(await runRow()).toMatchObject({ status: "running", claimedAt: null })
  })

  it("un id che non è un numero risponde 404 solo a chi ha il token", async () => {
    expect((await call("/run/abc", `Bearer ${await idToken()}`)).status).toBe(
      404
    )
    expect((await call("/run/abc")).status).toBe(401)
  })

  it("un import fallito risponde 200 con l'esito, così la coda non lo ripete", async () => {
    const runId = await startedImport()
    // The customer code of the row, taken after the preview (AC19b)
    await createCustomer({
      id: "altro",
      tempID: "1",
      fiscalCode: "VRDLGU75B02F205X",
    })

    const response = await call(`/run/${runId}`, `Bearer ${await idToken()}`)

    expect(response).toEqual({
      status: 200,
      body: { outcome: "failed" },
    })
    expect(await runRow()).toMatchObject({ status: "failed" })
  })

  it("un task consegnato di nuovo risponde 200 e non fa nulla", async () => {
    const runId = await startedImport()
    await call(`/run/${runId}`, `Bearer ${await idToken()}`)

    const again = await call(`/run/${runId}`, `Bearer ${await idToken()}`)

    expect(again).toEqual({ status: 200, body: { outcome: "skipped" } })
  })
})

describe("POST /internal/import/purge/:uploadId", () => {
  it("con il token della coda cancella le righe di un upload che nessun import usa", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await Effect.runPromise(
      createUpload({
        createdBy: admin.id,
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 2,
        data: new Uint8Array([1]),
      }).pipe(Effect.provide(ServerLive))
    )

    const response = await call(
      `/purge/${uploadId}`,
      `Bearer ${await idToken()}`
    )

    expect(response).toEqual({ status: 200, body: { outcome: "deleted" } })
    expect(await testDb.select().from(importUpload)).toEqual([])
  })

  it("senza token risponde 401 e non cancella nulla", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await Effect.runPromise(
      createUpload({
        createdBy: admin.id,
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 2,
        data: new Uint8Array([1]),
      }).pipe(Effect.provide(ServerLive))
    )

    expect((await call(`/purge/${uploadId}`)).status).toBe(401)
    expect(await testDb.select().from(importUpload)).toHaveLength(1)
  })

  it("le righe di un import in corso restano, e la pulizia torna dopo la sua scadenza", async () => {
    await startedImport()
    const [upload] = await testDb.select().from(importUpload)

    const response = await call(
      `/purge/${upload!.id}`,
      `Bearer ${await idToken()}`
    )

    expect(response).toEqual({ status: 200, body: { outcome: "kept" } })
    expect(queued).toMatchObject([{ kind: "purge", uploadId: upload!.id }])
  })

  it("un id che non è un UUID risponde 404", async () => {
    expect((await call("/purge/abc", `Bearer ${await idToken()}`)).status).toBe(
      404
    )
  })
})
