import { ConfigProvider, Effect } from "effect"
import { describe, expect, it } from "@effect/vitest"
import { storageConfigFromEnv } from "../config"
import { StorageConfigError } from "../errors"

// Environment values come from an in-memory provider, so process.env is never touched.
const load = (env: Record<string, string>, prefix?: string) =>
  storageConfigFromEnv(prefix).pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env })
    )
  )

const run = (env: Record<string, string>, prefix?: string) => load(env, prefix)
const fail = (env: Record<string, string>, prefix?: string) =>
  Effect.flip(load(env, prefix))

const serviceAccount = {
  type: "service_account",
  project_id: "p",
  private_key_id: "key-id",
  client_email: "sa@p.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
}

describe("storageConfigFromEnv", () => {
  it.effect("reads only the bucket when it is the only variable set", () =>
    Effect.gen(function* () {
      expect(yield* run({ GCS_BUCKET: "my-bucket" })).toEqual({
        bucket: "my-bucket",
      })
    })
  )

  it.effect("reads the optional project id", () =>
    Effect.gen(function* () {
      expect(yield* run({ GCS_BUCKET: "b", GCS_PROJECT_ID: "p" })).toEqual({
        bucket: "b",
        projectId: "p",
      })
    })
  )

  it.effect(
    "fails with StorageConfigError when the bucket is missing or blank",
    () =>
      Effect.gen(function* () {
        const missing = yield* fail({ GCS_PROJECT_ID: "p" })
        expect(missing).toBeInstanceOf(StorageConfigError)
        expect(missing.message).toContain("GCS_BUCKET")

        const blank = yield* fail({ GCS_BUCKET: "   " })
        expect(blank).toBeInstanceOf(StorageConfigError)
      })
  )

  it.effect("uses the given prefix for every variable", () =>
    Effect.gen(function* () {
      expect(
        yield* run({ ARCHIVE_BUCKET: "a", GCS_BUCKET: "ignored" }, "ARCHIVE")
      ).toEqual({ bucket: "a" })
    })
  )

  it.effect(
    "keeps only client_email and private_key from the credentials JSON",
    () =>
      Effect.gen(function* () {
        const config = yield* load({
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
  )

  it.effect("treats a blank credentials variable as unset", () =>
    Effect.gen(function* () {
      expect(
        yield* run({ GCS_BUCKET: "b", GCS_CREDENTIALS_JSON: "  " })
      ).toEqual({
        bucket: "b",
      })
    })
  )

  it.effect(
    "fails without echoing the key material when the JSON is malformed",
    () =>
      Effect.gen(function* () {
        const secret = "SECRET-KEY-MATERIAL"
        const error = yield* fail({
          GCS_BUCKET: "b",
          GCS_CREDENTIALS_JSON: `{"private_key": "${secret}`,
        })
        expect(error).toBeInstanceOf(StorageConfigError)
        expect(error.message).not.toContain(secret)
        expect(JSON.stringify(error)).not.toContain(secret)
      })
  )

  it.effect("fails when the credentials JSON has no private_key", () =>
    Effect.gen(function* () {
      const error = yield* fail({
        GCS_BUCKET: "b",
        GCS_CREDENTIALS_JSON: JSON.stringify({
          client_email: "sa@p.iam.gserviceaccount.com",
        }),
      })
      expect(error).toBeInstanceOf(StorageConfigError)
    })
  )
})
