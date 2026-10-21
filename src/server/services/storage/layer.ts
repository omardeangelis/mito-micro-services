import { createClient } from "@supabase/supabase-js"
import { Config, Effect, Layer, Option } from "effect"
import {
  makeGcsStorageLayer,
  storageConfigFromEnv,
  type Storage,
  type StorageConfigError,
} from "@s-p-a-talo/gcs-storage"
import { makeSupabaseStorageLayer } from "./supabase"

/** The Supabase bucket that holds MITO's files until storage moves to GCS. */
export const SUPABASE_BUCKET = "mito-storage"

/**
 * Not part of @s-p-a-talo/gcs-storage: MITO's storage. With `GCS_BUCKET` set it is
 * that GCS bucket (staging on Cloud Run), otherwise the Supabase bucket with
 * `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_KEY`. The environment is read when
 * the layer is built, never on import.
 */
export const StorageLive: Layer.Layer<Storage, StorageConfigError> =
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const gcsBucket = yield* Config.option(Config.string("GCS_BUCKET")).pipe(
        Effect.orElseSucceed(() => Option.none<string>())
      )
      if (Option.isSome(gcsBucket) && gcsBucket.value.trim() !== "") {
        return makeGcsStorageLayer(yield* storageConfigFromEnv("GCS"))
      }
      return makeSupabaseStorageLayer({
        // As before the move: createClient throws when they are missing
        client: () =>
          createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_KEY!
          ),
        bucket: SUPABASE_BUCKET,
      })
    })
  )
