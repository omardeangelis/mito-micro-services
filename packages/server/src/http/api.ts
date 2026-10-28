import { Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { serverLayer } from "../effect/server"
import { adminOnlyLayer } from "./adminOnly"
import { authenticatedLayer } from "./authenticated"
import { customerLayer } from "./customer"
import { meLayer } from "./me"
import { SessionReader } from "./session"

/**
 * The groups of the contract with their middleware. It still needs the
 * session (`SessionReader`) and `serverLayer`: the tests give theirs
 */
export const apiHandlersLayer = Layer.mergeAll(meLayer, customerLayer).pipe(
  Layer.provideMerge(Layer.merge(authenticatedLayer, adminOnlyLayer))
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
export const mitoApiLayer = HttpApiBuilder.layer(MitoApi).pipe(
  Layer.provide(apiHandlersLayer),
  Layer.provide(SessionReader.layer),
  Layer.provide(serverLayer),
  Layer.provide(platform)
)
