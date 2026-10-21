import { Config, Effect, Option, Redacted } from "effect"
import { StorageConfigError } from "./errors"

/** Lifetime of signed URLs when the caller does not set one. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900

export type StorageConfig = {
  /** Bucket name. */
  readonly bucket: string
  /** GCP project id. Optional: the client can infer it from the environment. */
  readonly projectId?: string
  /**
   * Service-account key used for every request and for signing URLs. Omit it
   * to use Application Default Credentials (on Cloud Run, the service account
   * of the service; signing then goes through the IAM signBlob API).
   */
  readonly credentials?: {
    readonly client_email: string
    readonly private_key: string
  }
  /** Lifetime of signed URLs, in seconds. Default 900 (15 minutes). */
  readonly signedUrlTtlSeconds?: number
  /** Upper bound for `upload` bodies, in bytes. Omit it for no limit. */
  readonly maxUploadBytes?: number
}

type ServiceAccount = {
  readonly client_email: string
  readonly private_key: string
}

const isBlank = (value: string) => value.trim() === ""

const readError = (name: string) => (cause: unknown) =>
  new StorageConfigError({
    key: name,
    message: `${name} could not be read`,
    cause,
  })

/** An environment variable as `Option`: `None` when it is unset or blank. */
const optionalString = (name: string) =>
  Config.option(Config.string(name)).pipe(
    Effect.mapError(readError(name)),
    Effect.map((value) => Option.filter(value, (text) => !isBlank(text)))
  )

const requiredString = (name: string) =>
  Effect.flatMap(optionalString(name), (value) =>
    Option.isSome(value)
      ? Effect.succeed(value.value)
      : Effect.fail(
          new StorageConfigError({ key: name, message: `${name} is required` })
        )
  )

const stringField = (value: unknown, field: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const found = (value as Record<string, unknown>)[field]
  return typeof found === "string" && found !== "" ? found : undefined
}

/**
 * Parses a service-account JSON and keeps only the two fields the client
 * needs. The parse error is deliberately discarded: `JSON.parse` messages can
 * echo a fragment of the input, which here is a private key.
 */
const parseServiceAccount = (
  name: string,
  json: string
): Effect.Effect<ServiceAccount, StorageConfigError> =>
  Effect.flatMap(
    Effect.try({
      try: (): unknown => JSON.parse(json),
      catch: () =>
        new StorageConfigError({
          key: name,
          message: `${name} is not valid JSON`,
        }),
    }),
    (parsed) => {
      const clientEmail = stringField(parsed, "client_email")
      const privateKey = stringField(parsed, "private_key")
      return clientEmail !== undefined && privateKey !== undefined
        ? Effect.succeed({ client_email: clientEmail, private_key: privateKey })
        : Effect.fail(
            new StorageConfigError({
              key: name,
              message: `${name} must be a service-account JSON with client_email and private_key`,
            })
          )
    }
  )

/** The credentials JSON is read as `Redacted`, so it is not printed by accident. */
const optionalCredentials = (name: string) =>
  Config.option(Config.redacted(name)).pipe(
    Effect.mapError(readError(name)),
    Effect.flatMap((raw) => {
      if (Option.isNone(raw)) return Effect.succeed(undefined)
      const json = Redacted.value(raw.value)
      return isBlank(json)
        ? Effect.succeed(undefined)
        : parseServiceAccount(name, json)
    })
  )

/**
 * Reads the storage configuration from environment variables named
 * `${prefix}_BUCKET` (required), `${prefix}_PROJECT_ID` (optional) and
 * `${prefix}_CREDENTIALS_JSON` (optional service-account JSON). Reads happen
 * when the Effect runs, never at import time.
 */
export const storageConfigFromEnv = (
  prefix = "GCS"
): Effect.Effect<StorageConfig, StorageConfigError> =>
  Effect.gen(function* () {
    const bucket = yield* requiredString(`${prefix}_BUCKET`)
    const projectId = yield* optionalString(`${prefix}_PROJECT_ID`)
    const credentials = yield* optionalCredentials(`${prefix}_CREDENTIALS_JSON`)
    return {
      bucket,
      ...(Option.isSome(projectId) ? { projectId: projectId.value } : {}),
      ...(credentials !== undefined ? { credentials } : {}),
    }
  })
