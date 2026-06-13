// richiamo del cron che aggiorno i customer e le pratiche
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

async function fetchUpdateCustomers() {
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

  const response = await fetch(`${baseUrl}/api/cron/update`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  return response
}

const updateCustomers = async () => {
  try {
    await fetchUpdateCustomers()
  } catch (error) {
    console.error("Error updating", error)
  }
}

await updateCustomers()
