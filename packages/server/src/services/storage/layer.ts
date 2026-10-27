import { createClient } from "@supabase/supabase-js"
import { Config, Effect, Layer, Option } from "effect"
import { withCurrentEnv } from "../../shared/currentEnv"
import { storageConfigFromEnv } from "./config"
import type { StorageConfigError } from "./errors"
import { gcsStorageLayer } from "./gcs"
import type { Storage } from "./storage"
import { supabaseStorageLayer } from "./supabase"

/** The Supabase bucket that holds MITO's files until storage moves to GCS. */
export const SUPABASE_BUCKET = "mito-storage"

/**
 * Not part of gcs-storage-kit: MITO's storage. With `GCS_BUCKET` set it is
 * that GCS bucket (staging on Cloud Run), otherwise the Supabase bucket with
 * `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_KEY`. The environment is read when
 * the layer is built, never on import.
 */
export const storageLayer: Layer.Layer<Storage, StorageConfigError> =
  Layer.unwrap(
    withCurrentEnv(
      Effect.gen(function* () {
        const gcsBucket = yield* Config.option(
          Config.String("GCS_BUCKET")
        ).pipe(Effect.orElseSucceed(() => Option.none<string>()))
        if (Option.isSome(gcsBucket) && gcsBucket.value.trim() !== "") {
          return gcsStorageLayer(yield* storageConfigFromEnv("GCS"))
        }
        return supabaseStorageLayer({
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
  )
