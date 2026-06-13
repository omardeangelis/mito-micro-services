// richiamo del cron job che elimina i file di export
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

async function fetchDeleteExportFiles() {
  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://mito-deutsche.vercel.app"

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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment

  return response
}

const deleteExportFiles = async () => {
  try {
    await fetchDeleteExportFiles()
  } catch (error) {
    console.error("Error deleting export files:", error)
  }
}

await deleteExportFiles()
