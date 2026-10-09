// // richiamo del cron job degli alert

import { setTimeout } from "node:timers/promises"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { cronBaseUrl, cronRequestInit } from "./cronRequest.js"
dotenv.config()

/**
 * @param {string} baseUrl
 * @param {string} secret
 */
async function fetchAlerts(baseUrl, secret) {
  // Genera il token JWT al volo
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const token = jwt.sign(
    { role: "cronjob", timestamp: Date.now() }, // Payload minimo
    secret,
    { expiresIn: "5m" } // Scadenza breve
  )

  return fetch(`${baseUrl}/api/cron/alert`, cronRequestInit(token))
}

/**
 * Calls the route once. Returns its body, or `undefined` when the call didn't
 * get through the alerts: Vercel's time limit (504), another server error, a
 * network error, or a run that failed as a whole.
 *
 * @param {string} baseUrl
 * @param {string} secret
 * @returns {Promise<{ processed?: number, failed?: number, remaining?: number } | undefined>}
 */
async function callRoute(baseUrl, secret) {
  let response
  try {
    response = await fetchAlerts(baseUrl, secret)
  } catch (error) {
    console.error("Request to /api/cron/alert failed:", error)
    return undefined
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    const message = `Request to /api/cron/alert failed: HTTP ${response.status} ${text}`
    // A wrong secret or URL fails the same way on every call
    if (response.status < 500) throw new Error(message)
    console.error(message)
    return undefined
  }
  /** @type {{ processed?: number, failed?: number, remaining?: number, error?: string }} */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const body = await response.json()
  // Printed in the GitHub Actions log: found, processed, skipped, failed,
  // remaining
  console.log(JSON.stringify(body))
  return body.error === undefined ? body : undefined
}

// Each call stops taking alerts before Vercel's time limit: the script calls
// again while some are left, up to this many calls
const MAX_CALLS = 20
// After a call that didn't get through the alerts, or that got through with some
// failed, the ones left are still open: the script waits this long and calls
// again, so today's get their followup today
const RETRY_DELAY_MS = 10_000

const updateAlert = async () => {
  try {
    const baseUrl = cronBaseUrl()
    const secret = process.env.CRON_SECRET_KEY
    if (!secret) {
      throw new Error("Missing CRON_SECRET_KEY environment variable")
    }
    let retryingFailed = false
    for (let call = 1; call <= MAX_CALLS; call++) {
      const body = await callRoute(baseUrl, secret)
      if (body === undefined) {
        await setTimeout(RETRY_DELAY_MS)
        continue
      }
      if ((body.remaining ?? 0) > 0) {
        // The next call takes the ones left, failed ones included: it is not a
        // retry of failed alerts
        retryingFailed = false
        continue
      }
      // Every call takes all the open alerts again: one that gets through them
      // with none failed leaves none behind
      if ((body.failed ?? 0) === 0) return
      // Failed alerts turn the job red once retrying them closes none
      if (retryingFailed && (body.processed ?? 0) === 0) {
        process.exit(1)
        return
      }
      retryingFailed = true
      await setTimeout(RETRY_DELAY_MS)
    }
    console.error(`Alerts still left after ${MAX_CALLS} calls`)
    process.exit(1)
  } catch (error) {
    console.error("Error updating alerts:", error)
    process.exit(1)
  }
}

await updateAlert()
