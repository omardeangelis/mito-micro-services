import { Layer } from "effect"
import { ServerLive } from "@mito/server/effect/server"
import { ImportConfigLive } from "@mito/server/services/import/config"
import { googleKeys } from "../oidc"
import { importAuth, importAuthDisabled } from "./auth"
import { type ImportRouteContext } from "./routes"

/**
 * The services of the import routes, from the env of the service:
 * IMPORT_OIDC_AUDIENCE and IMPORT_OIDC_SERVICE_ACCOUNT, the audience and the
 * service account of the queue's tokens (`deploy-staging.sh`). Without both,
 * every task is refused.
 */
export const importLive = (
  env: NodeJS.ProcessEnv
): Layer.Layer<ImportRouteContext> => {
  const audience = env.IMPORT_OIDC_AUDIENCE?.trim()
  const serviceAccount = env.IMPORT_OIDC_SERVICE_ACCOUNT?.trim()
  return Layer.mergeAll(
    ServerLive,
    ImportConfigLive,
    audience && serviceAccount
      ? importAuth({ audience, serviceAccount }, googleKeys())
      : importAuthDisabled
  )
}
