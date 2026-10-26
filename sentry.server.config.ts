// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import {
  dropExpectedTrpcErrors,
  dropQueryParams,
  dropRequestBody,
  sentryInitOptions,
} from "@/lib/utils/sentry"
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  ...sentryInitOptions,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  beforeSend: (event, hint) => {
    const kept = dropExpectedTrpcErrors(event, hint)
    return kept && dropRequestBody(dropQueryParams(kept))
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',
})
