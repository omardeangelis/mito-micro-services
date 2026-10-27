"use server"

import { getServerAuthSession } from "@mito/server/auth"
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })

/**
 * Lets the request through with a session, or with the token the cron scripts
 * sign with CRON_SECRET_KEY (`role: "cronjob"`, HS256, not expired), unless
 * `cronToken` is false. Returns `null` when authorized and the 401 response
 * otherwise: a missing, empty or malformed token, or a missing secret, is a
 * 401.
 */
export async function authCheck(
  request: Request,
  { cronToken = true }: { cronToken?: boolean } = {}
) {
  const session = await getServerAuthSession(request.headers)
  // controllo prima che ci sia la sessione: il nome può mancare (login via email)
  if (session?.user) return null

  // controllo che il JWT sia nell'header: tutto quello che segue "Bearer "
  if (!cronToken) return unauthorized()
  const authHeader = request.headers.get("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : ""
  const secret = process.env.CRON_SECRET_KEY
  if (!token || !secret) return unauthorized()

  try {
    // Verifica firma e scadenza (exp): un token scaduto lancia un errore
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] })
    // Controlla il ruolo nel payload
    if (typeof decoded === "string" || decoded.role !== "cronjob") {
      return unauthorized()
    }
    return null // Autorizzazione valida
  } catch (error) {
    console.error("JWT verification failed:", error)
    return unauthorized()
  }
}
