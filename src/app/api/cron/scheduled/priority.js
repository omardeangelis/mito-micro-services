// richiamo del cron job che elimina i file di export
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { cronBaseUrl, cronRequestInit } from "./cronRequest.js"
dotenv.config()

async function updatePriority() {
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
    `${baseUrl}/api/cron/priority`,
    cronRequestInit(token)
  )

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Request to /api/cron/priority failed: HTTP ${response.status} ${body}`
    )
  }

  return response
}

const updateTaskPriority = async () => {
  try {
    await updatePriority()
  } catch (error) {
    console.error("Error updating task priority:", error)
    process.exit(1)
  }
}

await updateTaskPriority()
