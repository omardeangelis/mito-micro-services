// richiamo del cron job che elimina i file di export
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { cronBaseUrl, cronHeaders } from "./cronRequest.js"
dotenv.config()

async function fetchDeleteExportFiles() {
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

  const response = await fetch(`${baseUrl}/api/cron/delete`, {
    method: "GET",
    headers: cronHeaders(token),
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Request to /api/cron/delete failed: HTTP ${response.status} ${body}`
    )
  }

  return response
}

const deleteExportFiles = async () => {
  try {
    await fetchDeleteExportFiles()
  } catch (error) {
    console.error("Error deleting export files:", error)
    process.exit(1)
  }
}

await deleteExportFiles()
