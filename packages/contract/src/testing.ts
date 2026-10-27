import { Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/http"

const noFiles = FileSystem.layerNoop({})

/**
 * What `HttpApiTest.groups` needs to run groups in memory, with no server and
 * no file system: the tests of the backend and of apps/web call the
 * endpoints through it (H14).
 */
export const inMemoryPlatform = Layer.mergeAll(
  Etag.layer,
  Path.layer,
  noFiles,
  HttpPlatform.layer.pipe(Layer.provide(Layer.merge(noFiles, Etag.layer)))
)
