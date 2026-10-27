// First, so Sentry's client exists before the rest of the server loads
import "./instrument"
import { serve } from "@hono/node-server"
import { app } from "./app"

// Cloud Run sets PORT
const port = Number(process.env.PORT ?? 4000)

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`mito-api listening on port ${port}`)
})
