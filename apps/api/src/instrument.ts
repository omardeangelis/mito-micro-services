// The backend's Sentry client, errors only. server.ts imports it first, so the
// client exists before the server code runs. Off outside the production
// deployment or without a DSN, as in Next.js (sentryInitOptions)
import * as Sentry from "@sentry/node"
import {
  dropExpectedTrpcErrors,
  dropQueryParams,
  dropRequestBody,
  sentryInitOptions,
} from "@/lib/utils/sentry"

Sentry.init({
  ...sentryInitOptions,

  // Even a disabled init registers the import-in-the-middle ESM hooks, which
  // only instrument modules for tracing. Staging, where it is off, must load
  // the modules as it did without Sentry
  registerEsmLoaderHooks: false,

  beforeSend: (event, hint) => {
    const kept = dropExpectedTrpcErrors(event, hint)
    return kept && dropRequestBody(dropQueryParams(kept))
  },
})
