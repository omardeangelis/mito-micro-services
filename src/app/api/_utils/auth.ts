"use server"

import { getServerAuthSession } from "@/server/auth"
import { NextResponse } from "next/server"
import jwt, { type JwtPayload } from "jsonwebtoken"

export async function authCheck(request?: Request) {
  const session = await getServerAuthSession()
  const authHeader = request?.headers.get("Authorization")
  const secret = process.env.CRON_SECRET_KEY!

  // controllo prima che ci sia la sessione
  if (!session?.user.name) {
    // controllo che il JWT sia presente nell'header
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.split(" ")[1]
    try {
      // Verifica il token
      if (token) {
        const decoded = jwt.verify(token, secret) as JwtPayload

        // Controlla il ruolo o altre proprietà del payload
        if (decoded.role !== "cronjob") {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Verifica la data di scadenza (exp)
        const currentTime = Math.floor(Date.now() / 1000)
        if (decoded.exp && decoded.exp < currentTime) {
          return NextResponse.json({ error: "Token expired" }, { status: 401 })
        }

        return null // Autorizzazione valida
      }
    } catch (error) {
      console.error("JWT verification failed:", error)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return null
}
