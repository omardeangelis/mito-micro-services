import { Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { ServerLive } from "../effect/server"
import { AuthenticatedLive } from "./authenticated"
import { MeLive } from "./me"
import { SessionReaderLive } from "./session"

/**
 * The groups of the contract with their middleware. It still needs the
 * session (`SessionReader`) and `ServerLive`: the tests give theirs
 */
export const ApiHandlersLive = Layer.mergeAll(MeLive).pipe(
  Layer.provideMerge(AuthenticatedLive)
)

// HttpApi serves no files: the platform without a file system
const noFiles = FileSystem.layerNoop({})
const platform = Layer.mergeAll(
  Etag.layer,
  Path.layer,
  noFiles,
  HttpPlatform.layer.pipe(Layer.provide(Layer.merge(noFiles, Etag.layer)))
)

/** `MitoApi` as the backend serves it, at `/api/v1` (apps/api/src/httpApi.ts) */
export const MitoApiLive = HttpApiBuilder.layer(MitoApi).pipe(
  Layer.provide(ApiHandlersLive),
  Layer.provide(SessionReaderLive),
  Layer.provide(ServerLive),
  Layer.provide(platform)
)
