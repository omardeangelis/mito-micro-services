// // richiamo del cron job degli alert

import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

async function fetchAlerts() {
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

  const response = await fetch(`${baseUrl}/api/cron/alert`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`, // Aggiunge il JWT nell'header
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Request to /api/cron/alert failed: HTTP ${response.status} ${body}`
    )
  }

  // LOG su telegram
  // await sendTelegramMessage(
  //   `RESPONSE: ${JSON.stringify(response)} || TOKEN: ${token} || SECRET: ${secret} || BASEURL: ${baseUrl} || NODE_ENV: ${process.env.NODE_ENV}`
  // )
  return response
}

const updateAlert = async () => {
  try {
    const response = await fetchAlerts()
    /** @type {{ failed?: number, error?: string }} */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = await response.json()
    // Printed in the GitHub Actions log: found, processed, skipped, failed
    console.log(JSON.stringify(body))
    // A run with failed alerts, or that failed as a whole, turns the job red
    if (body.error !== undefined || (body.failed ?? 0) > 0) process.exit(1)
  } catch (error) {
    console.error("Error updating alerts:", error)
    process.exit(1)
  }
}

await updateAlert()

/**
 * @param {string} message
 */
// async function sendTelegramMessage(message) {
//   const botToken = process.env.TELEGRAM_BOT_TOKEN
//   const chatId = process.env.TELEGRAM_CHAT_ID

//   if (!botToken || !chatId) {
//     console.error("Telegram bot token or chat ID is missing")
//     return
//   }

//   const url = `https://api.telegram.org/bot${botToken}/sendMessage`

//   try {
//     const response = await fetch(url, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         chat_id: chatId,
//         text: message,
//       }),
//     })

//     if (!response.ok) {
//       const errorResponse = await response.text()
//       console.error("Error sending Telegram message:", errorResponse)
//     }
//   } catch (error) {
//     console.error("Error in sendTelegramMessage:", error)
//   }
// }
