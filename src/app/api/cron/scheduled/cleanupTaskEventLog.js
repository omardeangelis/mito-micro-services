// richiamo del cron job che pulisce il task_event_log più vecchio della retention
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { cronBaseUrl, cronRequestInit } from "./cronRequest.js"
dotenv.config()

async function fetchCleanupTaskEventLog() {
  const baseUrl = cronBaseUrl()

  // Genera il token JWT al volo
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) {
    throw new Error("Missing CRON_SECRET_KEY environment variable")
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const token = jwt.sign(
    { role: "cronjob", timestamp: Date.now() }, // Payload minimo
    secret,
    { expiresIn: "5m" } // Scadenza breve
  )

  const response = await fetch(
    `${baseUrl}/api/cron/cleanupTaskEventLog`,
    cronRequestInit(token)
  )

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Request to /api/cron/cleanupTaskEventLog failed: HTTP ${response.status} ${body}`
    )
  }

  return response
}

const cleanupTaskEventLog = async () => {
  try {
    await fetchCleanupTaskEventLog()
  } catch (error) {
    console.error("Error cleaning up task_event_log:", error)
    process.exit(1)
  }
}

await cleanupTaskEventLog()
