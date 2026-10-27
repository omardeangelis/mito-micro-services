// Starts apps/api/dist/server.js as Cloud Run does and checks that it answers.
// It catches what breaks only in the bundle, like a package Node loads
// differently from Next.js. The env holds placeholders only, so nothing connects
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const child = spawn(
  process.execPath,
  [
    "--enable-source-maps",
    fileURLToPath(new URL("dist/server.js", import.meta.url)),
  ],
  {
    env: {
      PATH: process.env.PATH,
      SKIP_ENV_VALIDATION: "true",
      NODE_ENV: "development",
      PORT: "0",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_KEY: "smoke-placeholder",
      // better-auth stops without them, and adds Microsoft only with the
      // three Azure ones
      BETTER_AUTH_URL: "https://smoke.example.it",
      BETTER_AUTH_SECRET: "smoke-placeholder-of-at-least-32-chars",
      AZURE_AD_CLIENT_ID: "smoke-placeholder",
      AZURE_AD_CLIENT_SECRET: "smoke-placeholder",
      AZURE_AD_TENANT_ID: "smoke-placeholder",
    },
    stdio: ["ignore", "pipe", "inherit"],
  }
)

const fail = (message) => {
  console.error(`api:smoke failed: ${message}`)
  child.kill()
  process.exit(1)
}

const timer = setTimeout(() => fail("no answer within 20s"), 20_000)
child.on("exit", (code) => fail(`the server exited with code ${code}`))

const port = await new Promise((resolve) => {
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
    const match = output.match(/listening on port (\d+)/)
    if (match) resolve(match[1])
  })
})

const expect = async (path, status, method = "GET") => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method })
  if (response.status !== status)
    fail(`${path} answered ${response.status}, expected ${status}`)
  console.log(`api:smoke ${path} ${response.status}`)
}

await expect("/health", 200)
// A procedure that needs a session: the session middleware and the router run
await expect("/api/trpc/user.getUserPreference", 401)
// better-auth's routes, without a cookie: they answer without the database.
// The session of NextAuth's shape, for the frontend of the deploy before (D16)
await expect("/api/auth/get-session", 200)
await expect("/api/auth/session", 200)
// Outside the allowlist of authHandler (D9)
await expect("/api/auth/providers", 404)
// A REST route of the Next.js app, with NextResponse from next/server
await expect("/api/export/download", 401)
// The import queue's route, without its configuration: it refuses the task
await expect("/internal/import/run/1", 503, "POST")

clearTimeout(timer)
child.removeAllListeners("exit")
child.kill()
