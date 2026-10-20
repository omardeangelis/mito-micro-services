import { ConfigProvider, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { storageConfigFromEnv } from "../config"
import { StorageConfigError } from "../errors"

// Environment values come from an in-memory provider, so process.env is never touched.
const load = (env: Record<string, string>, prefix?: string) =>
  storageConfigFromEnv(prefix).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(new Map(Object.entries(env)))
    )
  )

const run = (env: Record<string, string>, prefix?: string) =>
  Effect.runPromise(load(env, prefix))
const fail = (env: Record<string, string>, prefix?: string) =>
  Effect.runPromise(Effect.flip(load(env, prefix)))

const serviceAccount = {
  type: "service_account",
  project_id: "p",
  private_key_id: "key-id",
  client_email: "sa@p.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
}

describe("storageConfigFromEnv", () => {
  it("reads only the bucket when it is the only variable set", async () => {
    expect(await run({ GCS_BUCKET: "my-bucket" })).toEqual({
      bucket: "my-bucket",
    })
  })

  it("reads the optional project id", async () => {
    expect(await run({ GCS_BUCKET: "b", GCS_PROJECT_ID: "p" })).toEqual({
      bucket: "b",
      projectId: "p",
    })
  })

  it("fails with StorageConfigError when the bucket is missing or blank", async () => {
    const missing = await fail({ GCS_PROJECT_ID: "p" })
    expect(missing).toBeInstanceOf(StorageConfigError)
    expect(missing.message).toContain("GCS_BUCKET")

    const blank = await fail({ GCS_BUCKET: "   " })
    expect(blank).toBeInstanceOf(StorageConfigError)
  })

  it("uses the given prefix for every variable", async () => {
    expect(
      await run({ ARCHIVE_BUCKET: "a", GCS_BUCKET: "ignored" }, "ARCHIVE")
    ).toEqual({ bucket: "a" })
  })

  it("keeps only client_email and private_key from the credentials JSON", async () => {
    const config = await run({
      GCS_BUCKET: "b",
      GCS_CREDENTIALS_JSON: JSON.stringify(serviceAccount),
    })
    expect(config).toEqual({
      bucket: "b",
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    })
  })

  it("treats a blank credentials variable as unset", async () => {
    expect(await run({ GCS_BUCKET: "b", GCS_CREDENTIALS_JSON: "  " })).toEqual({
      bucket: "b",
    })
  })

  it("fails without echoing the key material when the JSON is malformed", async () => {
    const secret = "SECRET-KEY-MATERIAL"
    const error = await fail({
      GCS_BUCKET: "b",
      GCS_CREDENTIALS_JSON: `{"private_key": "${secret}`,
    })
    expect(error).toBeInstanceOf(StorageConfigError)
    expect(error.message).not.toContain(secret)
    expect(JSON.stringify(error)).not.toContain(secret)
  })

  it("fails when the credentials JSON has no private_key", async () => {
    const error = await fail({
      GCS_BUCKET: "b",
      GCS_CREDENTIALS_JSON: JSON.stringify({
        client_email: "sa@p.iam.gserviceaccount.com",
      }),
    })
    expect(error).toBeInstanceOf(StorageConfigError)
  })
})
